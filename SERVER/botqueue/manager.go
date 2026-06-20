package botqueue

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"SERVER/serverlog"
)

type Status string

const (
	StatusWaiting    Status = "waiting"
	StatusConnecting Status = "connecting"
	StatusSearching  Status = "searching"
	StatusInBattle   Status = "in_battle"
	StatusFinished   Status = "finished"
	StatusError      Status = "error"
	StatusStopped    Status = "stopped"
)

type Item struct {
	BotID         string `json:"botId"`
	FirebaseToken string `json:"-"`
	Status        Status `json:"status"`
	LastEvent     string `json:"lastEvent"`
	StartedAt     string `json:"startedAt,omitempty"`
	UpdatedAt     string `json:"updatedAt,omitempty"`
}

type StartRequest struct {
	Bots                  []Input `json:"bots"`
	DelayAfterGameStartMs int     `json:"delayAfterGameStartMs"`
}

type Input struct {
	BotID         string `json:"botId"`
	FirebaseToken string `json:"firebaseToken"`
}

type EventRequest struct {
	BotID     string `json:"botId"`
	EventName string `json:"eventName"`
	Message   string `json:"message"`
}

type Snapshot struct {
	Running               bool   `json:"running"`
	ActiveSearching       string `json:"activeSearching"`
	DelayAfterGameStartMs int    `json:"delayAfterGameStartMs"`
	Bots                  []Item `json:"bots"`
}

type Manager struct {
	mu                    sync.Mutex
	bots                  []*Item
	running               bool
	activeSearching       string
	delayAfterGameStartMs int
}

func NewManager() *Manager {
	return &Manager{
		delayAfterGameStartMs: 1000,
	}
}

func (m *Manager) Start(req StartRequest) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(req.Bots) == 0 {
		return fmt.Errorf("bot list cannot be empty")
	}

	if len(req.Bots) > 200 {
		return fmt.Errorf("maximum 200 bots per queue run")
	}

	delay := req.DelayAfterGameStartMs
	if delay <= 0 {
		delay = 1000
	}

	now := time.Now().Format(time.RFC3339)
	items := make([]*Item, 0, len(req.Bots))
	seen := map[string]bool{}

	for i, input := range req.Bots {
		botID := strings.TrimSpace(input.BotID)
		firebaseToken := strings.TrimSpace(input.FirebaseToken)

		if botID == "" {
			botID = fmt.Sprintf("bot_%d", i+1)
		}

		if seen[botID] {
			return fmt.Errorf("duplicate botId: %s", botID)
		}
		seen[botID] = true

		if firebaseToken == "" {
			return fmt.Errorf("firebaseToken for %s cannot be empty", botID)
		}

		items = append(items, &Item{
			BotID:         botID,
			FirebaseToken: firebaseToken,
			Status:        StatusWaiting,
			LastEvent:     "queued",
			StartedAt:     now,
			UpdatedAt:     now,
		})
	}

	m.bots = items
	m.running = true
	m.activeSearching = ""
	m.delayAfterGameStartMs = delay

	go m.startNextBot()
	return nil
}

func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.running = false
	m.activeSearching = ""
	now := time.Now().Format(time.RFC3339)

	for _, bot := range m.bots {
		if bot.Status == StatusWaiting || bot.Status == StatusConnecting || bot.Status == StatusSearching {
			bot.Status = StatusStopped
			bot.LastEvent = "queue stopped"
			bot.UpdatedAt = now
		}
	}
}

func (m *Manager) Snapshot() Snapshot {
	m.mu.Lock()
	defer m.mu.Unlock()

	bots := make([]Item, 0, len(m.bots))
	for _, bot := range m.bots {
		bots = append(bots, *bot)
	}

	return Snapshot{
		Running:               m.running,
		ActiveSearching:       m.activeSearching,
		DelayAfterGameStartMs: m.delayAfterGameStartMs,
		Bots:                  bots,
	}
}

func (m *Manager) startNextBot() {
	m.mu.Lock()
	if !m.running || m.activeSearching != "" {
		m.mu.Unlock()
		return
	}

	var nextBot *Item
	for _, bot := range m.bots {
		if bot.Status == StatusWaiting {
			nextBot = bot
			break
		}
	}

	if nextBot == nil {
		m.running = false
		m.mu.Unlock()
		serverlog.Success("BOT QUEUE - all bots were started")
		return
	}

	now := time.Now().Format(time.RFC3339)
	nextBot.Status = StatusConnecting
	nextBot.LastEvent = "connecting"
	nextBot.UpdatedAt = now
	m.activeSearching = nextBot.BotID
	botID := nextBot.BotID
	m.mu.Unlock()

	serverlog.Info(fmt.Sprintf("BOT QUEUE - starting bot: %s", botID))
	go m.runBot(botID)
}

func (m *Manager) runBot(botID string) {
	time.Sleep(300 * time.Millisecond)

	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.running || m.activeSearching != botID {
		return
	}

	bot := m.findBotLocked(botID)
	if bot == nil {
		return
	}

	bot.Status = StatusSearching
	bot.LastEvent = "join queue sent - waiting game-start"
	bot.UpdatedAt = time.Now().Format(time.RFC3339)

	serverlog.Info(fmt.Sprintf("BOT QUEUE - %s is searching. Send POST /bot-queue/event with eventName=game-start when it enters a battle", botID))
}

func (m *Manager) HandleEvent(botID string, eventName string, message string) error {
	botID = strings.TrimSpace(botID)
	eventName = strings.TrimSpace(eventName)
	message = strings.TrimSpace(message)

	if botID == "" || eventName == "" {
		return fmt.Errorf("botId and eventName cannot be empty")
	}

	m.mu.Lock()
	bot := m.findBotLocked(botID)
	if bot == nil {
		m.mu.Unlock()
		return fmt.Errorf("botId not found: %s", botID)
	}

	now := time.Now().Format(time.RFC3339)
	if message == "" {
		message = eventName
	}

	switch eventName {
	case "game-start", "vocab-battle:game-start":
		bot.Status = StatusInBattle
		bot.LastEvent = message
		bot.UpdatedAt = now

		if m.activeSearching == botID {
			m.activeSearching = ""
		}

		delay := m.delayAfterGameStartMs
		m.mu.Unlock()

		serverlog.Success(fmt.Sprintf("BOT QUEUE - %s entered battle, preparing next bot", botID))
		go func() {
			time.Sleep(time.Duration(delay) * time.Millisecond)
			m.startNextBot()
		}()
		return nil

	case "game-over", "vocab-battle:game-over":
		bot.Status = StatusFinished
		bot.LastEvent = message
		bot.UpdatedAt = now

		if m.activeSearching == botID {
			m.activeSearching = ""
		}

		m.mu.Unlock()
		return nil

	case "error":
		bot.Status = StatusError
		bot.LastEvent = message
		bot.UpdatedAt = now

		if m.activeSearching == botID {
			m.activeSearching = ""
		}

		m.mu.Unlock()
		go m.startNextBot()
		return nil

	default:
		bot.LastEvent = message
		bot.UpdatedAt = now
		m.mu.Unlock()
		return nil
	}
}

func (m *Manager) findBotLocked(botID string) *Item {
	for _, bot := range m.bots {
		if bot.BotID == botID {
			return bot
		}
	}
	return nil
}
