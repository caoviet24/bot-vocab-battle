'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Shield,
  User,
  Users,
  Clock,
  Send,
  Trash2,
  Download,
  RefreshCw,
  Search,
  X,
  Zap,
  KeyRound,
  Gem,
  Bot,
  Play,
  Square,
  ListChecks,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const SOCKET_URL = process.env.SOCKET_URL ?? 'wss://api-socket.parroto.app/socket.io/?EIO=4&transport=websocket';
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:8080';

type LogEvent = {
  id: string;
  direction: 'in' | 'out' | 'auth' | 'error';
  type: string;
  data: any;
  time: string;
};

type CollectedVocab = {
  cardId: string;
  word: string;
  time: string;
};

type ServerCard = {
  id: number | null;
  card_id: string;
  word: string;
  source: string;
};

type Opponent = {
  userId: string;
  displayName?: string;
  photoURL?: string;
  isPremium?: boolean;
  diamonds?: number;
};

type UserInfo = {
  userId: string;
  email: string;
};

type BotQueueInputBot = {
  botId: string;
  firebaseToken: string;
  userId: string;
  email: string;
};

type BotQueueServerBot = {
  botId?: string;
  bot_id?: string;
  firebaseToken?: string;
  firebase_token?: string;
  userId?: string;
  user_id?: string;
  email?: string;
  status?: string;
  lastEvent?: string;
  last_event?: string;
  message?: string;
  retryCount?: number;
  retry_count?: number;
  startedAt?: string;
  started_at?: string;
  updatedAt?: string;
  updated_at?: string;
};

type BotQueueStatus = {
  running?: boolean;
  activeSearching?: string;
  active_searching?: string;
  bots: BotQueueServerBot[];
  message?: string;
  totalBots?: number;
  updatedAt?: string;
};

const DEFAULT_USER_INFO: UserInfo = {
  userId: 'Không có ID',
  email: 'Không có Email',
};

const decodeJwtPayload = (token: string): any | null => {
  const jwt = token.trim();
  const payloadPart = jwt.split('.')[1];

  if (!payloadPart) return null;

  try {
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = atob(paddedBase64);

    const json = decodeURIComponent(
      decoded
        .split('')
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );

    return JSON.parse(json);
  } catch {
    return null;
  }
};

const getUserInfoFromFirebaseToken = (token: string): UserInfo => {
  const payload = decodeJwtPayload(token);

  return {
    userId: payload?.user_id || payload?.uid || payload?.sub || 'Không có ID',
    email: payload?.email || payload?.firebase?.identities?.email?.[0] || 'Không có Email',
  };
};

const getAvoidUserIdList = (value: string) =>
  value
    .split(/[\s,;]+/)
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);

const parseBotQueueInput = (value: string): BotQueueInputBot[] => {
  return value
    .split('\n')
    .map((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) return null;

      // Hỗ trợ 2 kiểu nhập:
      // 1) Mỗi dòng là 1 Firebase Token
      // 2) bot_1|FirebaseToken
      const parts = line.split('|').map((part) => part.trim());
      const hasCustomBotId = parts.length >= 2;
      const botId = hasCustomBotId && parts[0] ? parts[0] : `bot_${index + 1}`;
      const firebaseToken = hasCustomBotId ? parts.slice(1).join('|').trim() : line;

      if (!firebaseToken) return null;

      const info = getUserInfoFromFirebaseToken(firebaseToken);
      return {
        botId,
        firebaseToken,
        userId: info.userId,
        email: info.email,
      };
    })
    .filter((item): item is BotQueueInputBot => Boolean(item));
};

const normalizeBotQueueResponse = (payload: any): BotQueueStatus => {
  const data = payload?.data ?? payload ?? {};
  const bots = Array.isArray(data?.bots) ? data.bots : Array.isArray(data) ? data : [];

  return {
    ...data,
    bots,
  };
};

const getBotQueueStatusLabel = (status?: string) => {
  switch ((status || '').toLowerCase()) {
    case 'waiting':
      return 'Đang chờ';
    case 'connecting':
      return 'Đang kết nối';
    case 'searching':
      return 'Đang tìm trận';
    case 'in_battle':
      return 'Đã vào trận';
    case 'finished':
      return 'Hoàn tất';
    case 'error':
      return 'Lỗi';
    case 'stopped':
      return 'Đã dừng';
    case 'draft':
      return 'Chưa gửi server';
    default:
      return status || '--';
  }
};

const getBotQueueStatusClass = (status?: string) => {
  switch ((status || '').toLowerCase()) {
    case 'waiting':
      return 'border-slate-200 bg-slate-100 text-slate-600';
    case 'connecting':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'searching':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'in_battle':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'finished':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'error':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'stopped':
      return 'border-slate-200 bg-white text-slate-500';
    case 'draft':
      return 'border-dashed border-slate-200 bg-white text-slate-400';
    default:
      return 'border-slate-200 bg-white text-slate-600';
  }
};

export default function ParotoMonitor() {
  const [socketStatus, setSocketStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [firebaseToken, setFirebaseToken] = useState('');
  const [autoConnect, setAutoConnect] = useState(false);

  // Các state mới phục vụ Refresh Token
  const [apiKey, setApiKey] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [autoRefreshToken, setAutoRefreshToken] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [avoidUserIds, setAvoidUserIds] = useState('');
  const [botQueueText, setBotQueueText] = useState('');
  const [botQueueDelayMs, setBotQueueDelayMs] = useState('1000');
  const [botQueueAutoRefresh, setBotQueueAutoRefresh] = useState(true);
  const [botQueueStatus, setBotQueueStatus] = useState<BotQueueStatus | null>(null);
  const [isStartingBotQueue, setIsStartingBotQueue] = useState(false);
  const [isStoppingBotQueue, setIsStoppingBotQueue] = useState(false);
  const [isLoadingBotQueue, setIsLoadingBotQueue] = useState(false);

  const [userInfo, setUserInfo] = useState<UserInfo>(DEFAULT_USER_INFO);
  const [stats, setStats] = useState({ total: 0, received: 0, sent: 0, errors: 0 });
  const [matchStats, setMatchStats] = useState({ wins: 0, losses: 0 });
  const [myCorrectCount, setMyCorrectCount] = useState(0);
  const [myDiamonds, setMyDiamonds] = useState<number | null>(null); // Quản lý kim cương của bản thân
  const [opponentCorrectCount, setOpponentCorrectCount] = useState(0);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [collectedVocabs, setCollectedVocabs] = useState<CollectedVocab[]>([]);
  const [serverCards, setServerCards] = useState<ServerCard[]>([]);
  const [serverDataStatus, setServerDataStatus] = useState('Chưa tải');
  const [serverLastSyncTime, setServerLastSyncTime] = useState('Chưa đồng bộ');
  const [isLoadingServerCards, setIsLoadingServerCards] = useState(false);
  const [serverSearch, setServerSearch] = useState('');
  const [isInBattle, setIsInBattle] = useState(false);
  const [isSearchingBattle, setIsSearchingBattle] = useState(false);
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [roundText, setRoundText] = useState('Round: -- / --');
  const [wordMask, setWordMask] = useState('_ _ _ _');
  const [wordMeaning, setWordMeaning] = useState('Chờ tải dữ liệu...');
  const [wordExample, setWordExample] = useState<{ en: string; vi: string }>({ en: '...', vi: '' });
  const [missingCardId, setMissingCardId] = useState<string | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [autoSend, setAutoSend] = useState(false);
  const [autoJoin, setAutoJoin] = useState(false);
  const [autoSyncAfterBattle, setAutoSyncAfterBattle] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerMessage, setTimerMessage] = useState('Thời gian round: Chờ trận...');

  const socketRef = useRef<WebSocket | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentCardIdRef = useRef<string | null>(null);

  const autoSendRef = useRef(false);
  const autoJoinRef = useRef(false);
  const autoConnectRef = useRef(false);
  const autoSyncAfterBattleRef = useRef(false);
  const autoRefreshTokenRef = useRef(false);
  const firebaseTokenRef = useRef('');
  const avoidUserIdsRef = useRef('');
  const manualDisconnectRef = useRef(false);
  const failedConnectionsRef = useRef(0); // Chỉ dùng để hiển thị số lần socket lỗi, không còn dùng ngưỡng 5 lần
  const pendingAutoJoinAfterReconnectRef = useRef(false);

  const opponentRef = useRef<Opponent | null>(null);
  const matchStatsRef = useRef({ wins: 0, losses: 0 });
  const userInfoRef = useRef<UserInfo>(DEFAULT_USER_INFO);
  const serverLoadingRef = useRef(false);
  const botQueuePollingRef = useRef<NodeJS.Timeout | null>(null);

  const applyFirebaseToken = (token: string, logSource = 'Manual Input', shouldLog = false) => {
    const cleanToken = token.trim();
    setFirebaseToken(cleanToken);
    firebaseTokenRef.current = cleanToken;
    localStorage.setItem('paroto_firebase_token', cleanToken);

    if (!cleanToken) {
      setUserInfo(DEFAULT_USER_INFO);
      userInfoRef.current = DEFAULT_USER_INFO;
      return;
    }

    const updatedUserInfo = getUserInfoFromFirebaseToken(cleanToken);
    setUserInfo(updatedUserInfo);
    userInfoRef.current = updatedUserInfo;

    if (updatedUserInfo.userId === DEFAULT_USER_INFO.userId) {
      if (shouldLog) {
        pushLog('error', '🔴 Token không hợp lệ', 'Không decode được payload của firebaseToken JWT.');
      }
      return;
    }

    if (shouldLog) {
      pushLog(
        'auth',
        '🔑 Firebase Token Payload',
        `${logSource}: UID=${updatedUserInfo.userId}, Email=${updatedUserInfo.email}`
      );
    }
  };

  const handleSetAutoSend = (val: boolean) => {
    setAutoSend(val);
    autoSendRef.current = val;
  };

  const handleSetAutoJoin = (val: boolean) => {
    setAutoJoin(val);
    autoJoinRef.current = val;
  };

  const handleSetAutoConnect = (val: boolean) => {
    setAutoConnect(val);
    autoConnectRef.current = val;
    localStorage.setItem('paroto_auto_connect', String(val));

    if (val && socketRef.current?.readyState !== WebSocket.OPEN && socketStatus === 'disconnected') {
      pushLog('auth', '🟢 Auto Connect', 'Đã bật tự động kết nối socket.');
      setTimeout(() => {
        if (autoConnectRef.current && socketRef.current?.readyState !== WebSocket.OPEN) {
          connectSocket();
        }
      }, 300);
    }
  };

  const handleSetAutoSyncAfterBattle = (val: boolean) => {
    setAutoSyncAfterBattle(val);
    autoSyncAfterBattleRef.current = val;
    localStorage.setItem('paroto_auto_sync_after_battle', String(val));
  };

  const handleSetAutoRefreshToken = (val: boolean) => {
    setAutoRefreshToken(val);
    autoRefreshTokenRef.current = val;
    localStorage.setItem('paroto_auto_refresh_token', String(val));
  };

  const handleSetBotQueueAutoRefresh = (val: boolean) => {
    setBotQueueAutoRefresh(val);
    localStorage.setItem('paroto_bot_queue_auto_refresh', String(val));
  };

  const handleAvoidUserIdsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAvoidUserIds(value);
    avoidUserIdsRef.current = value;
    localStorage.setItem('paroto_avoid_user_ids', value);
  };

  const handleAutoOutMatchedOpponent = (matchedOpponent: Opponent | null) => {
    if (!matchedOpponent?.userId) return false;

    const avoidIds = getAvoidUserIdList(avoidUserIdsRef.current);
    const opponentId = matchedOpponent.userId.trim().toLowerCase();

    if (!avoidIds.includes(opponentId)) return false;

    pushLog(
      'auth',
      '🚪 Auto Out',
      `Gặp đúng UID cần né: ${matchedOpponent.userId}${matchedOpponent.displayName ? ` (${matchedOpponent.displayName})` : ''} -> tự động thoát trận.`
    );

    setIsInBattle(false);
    setIsSearchingBattle(false);
    setOpponent(null);
    opponentRef.current = null;
    currentCardIdRef.current = null;
    stopRoundTimer('Đã tự động out do gặp UID cần né 🚪');
    disconnectSocket();
    return true;
  };

  const handleRefreshFirebaseToken = async () => {
    if (!apiKey.trim() || !refreshToken.trim()) {
      pushLog('error', '🔴 Đổi Token thất bại', 'Thiếu API Key hoặc Refresh Token để thực hiện gia hạn.');
      return false;
    }

    setIsRefreshing(true);
    pushLog('auth', '🔄 Đang làm mới Token', 'Đang gửi yêu cầu làm mới access token tới Go API Server...');

    try {
      const response = await axios.post(`${API_BASE_URL}/refresh-token`, {
        key: apiKey.trim(),
        refresh_token: refreshToken.trim()
      }, { timeout: 10000 });

      if (response.status === 200) {
        const data = response.data;
        const newAccessToken = data.id_token || data.access_token;
        const newRefreshToken = data.refresh_token;

        if (newAccessToken) {
          pushLog('auth', '✨ Token mới đã cập nhật', `Đổi thành công! User ID: ${data.user_id || 'N/A'}`);

          // Ghi đè lên state và storage
          applyFirebaseToken(newAccessToken, 'Auto Refresh API', true);
          if (newRefreshToken) {
            setRefreshToken(newRefreshToken);
            localStorage.setItem('paroto_refresh_token', newRefreshToken);
          }

          failedConnectionsRef.current = 0;
          setIsRefreshing(false);
          return true;
        }
      }
      throw new Error("Không lấy được access_token/id_token hợp lệ từ phản hồi.");
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message;
      pushLog('error', '🔴 Lỗi khi gọi API Refresh Token', errMsg);
      setIsRefreshing(false);
      return false;
    }
  };

  const serverCardMap = useMemo(() => {
    const map = new Map<string, ServerCard>();
    serverCards.forEach((card) => {
      if (card.card_id) map.set(card.card_id, card);
    });
    return map;
  }, [serverCards]);

  const botQueueInputBots = useMemo(() => parseBotQueueInput(botQueueText), [botQueueText]);

  const botQueueDisplayRows = useMemo(() => {
    const serverBots = botQueueStatus?.bots || [];
    if (serverBots.length > 0) return serverBots;

    return botQueueInputBots.map((bot) => ({
      botId: bot.botId,
      userId: bot.userId,
      email: bot.email,
      status: 'draft',
      lastEvent: 'Chưa gửi server',
    }));
  }, [botQueueInputBots, botQueueStatus]);

  const botQueueSummary = useMemo(() => {
    const counts = botQueueDisplayRows.reduce<Record<string, number>>((acc, bot) => {
      const status = (bot.status || 'unknown').toLowerCase();
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return {
      total: botQueueDisplayRows.length,
      waiting: counts.waiting || 0,
      searching: counts.searching || 0,
      inBattle: counts.in_battle || 0,
      error: counts.error || 0,
      stopped: counts.stopped || 0,
    };
  }, [botQueueDisplayRows]);

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    // Khôi phục các tùy chọn cấu hình từ bộ nhớ
    const cachedStats = localStorage.getItem('paroto_match_stats');
    if (cachedStats) {
      try {
        const pStats = JSON.parse(cachedStats);
        setMatchStats(pStats);
        matchStatsRef.current = pStats;
      } catch { /* ignore */ }
    }

    const cachedAutoConnect = localStorage.getItem('paroto_auto_connect') === 'true';
    setAutoConnect(cachedAutoConnect);
    autoConnectRef.current = cachedAutoConnect;

    const cachedAutoSyncAfterBattle = localStorage.getItem('paroto_auto_sync_after_battle') === 'true';
    setAutoSyncAfterBattle(cachedAutoSyncAfterBattle);
    autoSyncAfterBattleRef.current = cachedAutoSyncAfterBattle;

    const cachedAutoRefresh = localStorage.getItem('paroto_auto_refresh_token') === 'true';
    setAutoRefreshToken(cachedAutoRefresh);
    autoRefreshTokenRef.current = cachedAutoRefresh;

    const cachedApiKey = localStorage.getItem('paroto_api_key') || '';
    setApiKey(cachedApiKey);

    const cachedRefreshToken = localStorage.getItem('paroto_refresh_token') || '';
    setRefreshToken(cachedRefreshToken);

    const cachedAvoidUserIds = localStorage.getItem('paroto_avoid_user_ids') || '';
    setAvoidUserIds(cachedAvoidUserIds);
    avoidUserIdsRef.current = cachedAvoidUserIds;

    const cachedBotQueueText = localStorage.getItem('paroto_bot_queue_list') || '';
    setBotQueueText(cachedBotQueueText);

    const cachedBotQueueDelay = localStorage.getItem('paroto_bot_queue_delay_ms') || '1000';
    setBotQueueDelayMs(cachedBotQueueDelay);

    const cachedBotQueueAutoRefresh = localStorage.getItem('paroto_bot_queue_auto_refresh') !== 'false';
    setBotQueueAutoRefresh(cachedBotQueueAutoRefresh);

    try {
      const cachedFirebaseToken =
        localStorage.getItem('paroto_firebase_token') ||
        localStorage.getItem('firebaseToken') ||
        localStorage.getItem('firebase_token') || '';

      if (cachedFirebaseToken) {
        applyFirebaseToken(cachedFirebaseToken, 'Auto Load Token', true);
      }
    } catch (err) {
      pushLog('error', '🔴 Lỗi đọc firebaseToken', String(err));
    }

    loadCardsFromApi();

    if (cachedAutoConnect) {
      setTimeout(() => {
        if (autoConnectRef.current && socketRef.current?.readyState !== WebSocket.OPEN) {
          connectSocket();
        }
      }, 500);
    }

    return () => {
      if (socketRef.current) socketRef.current.close();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!botQueueAutoRefresh) {
      if (botQueuePollingRef.current) clearInterval(botQueuePollingRef.current);
      botQueuePollingRef.current = null;
      return;
    }

    loadBotQueueStatus(true);
    botQueuePollingRef.current = setInterval(() => {
      loadBotQueueStatus(true);
    }, 4000);

    return () => {
      if (botQueuePollingRef.current) clearInterval(botQueuePollingRef.current);
      botQueuePollingRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botQueueAutoRefresh]);

  const pushLog = (direction: LogEvent['direction'], type: string, data: any) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour12: false, fractionalSecondDigits: 3 } as any);
    const newEvent: LogEvent = {
      id: Math.random().toString(36).substring(2, 9),
      direction,
      type,
      data,
      time: timeStr,
    };
    setEvents((prev) => [newEvent, ...prev].slice(0, 500));
    setStats((prev) => ({
      ...prev,
      total: prev.total + 1,
      received: direction === 'in' ? prev.received + 1 : prev.received,
      sent: direction === 'out' ? prev.sent + 1 : prev.sent,
      errors: direction === 'error' ? prev.errors + 1 : prev.errors,
    }));
  };

  const loadCardsFromApi = async () => {
    if (serverLoadingRef.current) return;

    serverLoadingRef.current = true;
    setIsLoadingServerCards(true);
    setServerDataStatus('Đang tải...');

    try {
      const res = await axios.get(`${API_BASE_URL}/cards`, { timeout: 5000 });
      const rawData = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.data) ? res.data.data : [];
      const normalized: ServerCard[] = rawData
        .map((item: any) => ({
          id: item.id ?? null,
          card_id: String(item.card_id || item.cardId || '').trim(),
          word: String(item.word || item.Word || '').trim(),
          source: item.source || 'server',
        }))
        .filter((item: any) => item.card_id && item.word);

      const syncedAt = new Date().toLocaleTimeString('vi-VN', { hour12: false } as any);
      setServerCards(normalized);
      setServerDataStatus(`Đã nạp ${normalized.length.toLocaleString('vi-VN')} từ`);
      setServerLastSyncTime(syncedAt);
      pushLog('auth', '🌐 API Load', `Đã đồng bộ ${normalized.length.toLocaleString('vi-VN')} từ vựng từ Server Go lúc ${syncedAt}.`);
    } catch (err: any) {
      setServerDataStatus('Lỗi kết nối');
      pushLog('error', '🔴 API Load Failed', `Không kết nối được API Go backend: ${err.message}`);
    } finally {
      serverLoadingRef.current = false;
      setIsLoadingServerCards(false);
    }
  };

  const syncWordToApi = async (cardId: string, word: string) => {
    try {
      const res = await axios.post(`${API_BASE_URL}/cards`, { card_id: cardId, word }, { timeout: 5000 });
      if (res.status === 201) {
        const saved = res.data?.data;
        updateServerCardState(cardId, word, saved?.id || null, 'server');
        pushLog('auth', '🌐 API Sync', `Đã đồng bộ lên database server: [${word}]`);
      }
    } catch (err: any) {
      if (err.response?.status === 409) {
        updateServerCardState(cardId, word, null, 'server');
      } else {
        pushLog('error', '🔴 API Sync Error', `Lỗi đẩy từ vựng lên API: ${err.message}`);
      }
    }
  };

  const updateServerCardState = (cardId: string, word: string, id: number | null, source: string) => {
    setServerCards((prev) => {
      const exists = prev.some((c) => c.card_id === cardId);
      if (exists) {
        return prev.map((c) => (c.card_id === cardId ? { ...c, word, source, id: id ?? c.id } : c));
      } else {
        return [{ id, card_id: cardId, word, source }, ...prev];
      }
    });
  };

  const startRoundTimer = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setTimeLeft(30);
    setTimerMessage('⏱️ Còn lại: 30 giây');
    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current!);
          return 0;
        }
        setTimerMessage(`⏱️ Còn lại: ${prev - 1} giây`);
        return prev - 1;
      });
    }, 1000);
  };

  const stopRoundTimer = (msg: string) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setTimerMessage(msg);
    setTimeLeft(0);
  };

  const handleIncomingGameEvent = (eventName: string, eventData: any) => {
    pushLog('in', `📨 ${eventName}`, eventData);
    switch (eventName) {
      case 'vocab-battle:game-start':
        setIsInBattle(true);
        setIsSearchingBattle(false);
        setMyCorrectCount(0);
        setOpponentCorrectCount(0);
        const matchedOpponent = eventData?.opponent || null;
        setOpponent(matchedOpponent);
        opponentRef.current = matchedOpponent;

        if (handleAutoOutMatchedOpponent(matchedOpponent)) {
          break;
        }

        // Trích xuất số kim cương ban đầu của bạn nếu server trả về danh sách players
        if (Array.isArray(eventData?.players)) {
          const me = eventData.players.find((p: any) => p.userId === userInfoRef.current.userId);
          if (me && me.diamonds !== undefined) setMyDiamonds(me.diamonds);
        }
        break;
      case 'vocab-battle:round-start':
        setMissingCardId(null);
        startRoundTimer();
        const round = eventData?.round || 0;
        const totalRounds = eventData?.totalRounds || 0;
        const card = eventData?.card;
        if (card) {
          currentCardIdRef.current = card.cardId;
          setRoundText(`Round: ${round} / ${totalRounds}`);
          setWordMask(`${card.wordMask || ''} (${card.wordLength || 0} ký tự)`);
          setWordMeaning(card.translation?.vi || 'Không có dịch nghĩa');
          setWordExample({ en: card.exampleMasked?.en || '...', vi: card.exampleMasked?.vi || '' });
          const targetWord = serverCardMap.get(card.cardId)?.word || '';
          if (targetWord) {
            setAnswerInput(targetWord);
            triggerAutoSolver(targetWord);
          } else {
            setMissingCardId(card.cardId);
            setAnswerInput('');
          }
        }
        break;
      case 'vocab-battle:round-result':
      case 'vocab-battle:round-timeout':
        const statusMsg = eventName.includes('timeout') ? 'Hết giờ round! ⏰' : 'Round kết thúc ✅';
        stopRoundTimer(statusMsg);
        const roundWord = eventData?.word;
        if (roundWord && currentCardIdRef.current) {
          updateServerCardState(currentCardIdRef.current, roundWord, null, 'new');
          const nowStr = new Date().toLocaleTimeString('vi-VN', { hour12: false } as any);
          setCollectedVocabs((prev) => {
            if (!prev.some((v) => v.cardId === currentCardIdRef.current)) {
              return [{ cardId: currentCardIdRef.current!, word: roundWord, time: nowStr }, ...prev];
            }
            return prev;
          });
          syncWordToApi(currentCardIdRef.current, roundWord);
        }

        // CẬP NHẬT KIM CƯƠNG CỦA BẠN SAU MỖI ROUND TỪ `eventData.players`
        if (Array.isArray(eventData?.players)) {
          const me = eventData.players.find((p: any) => p.userId === userInfoRef.current.userId);
          if (me && me.diamonds !== undefined) {
            setMyDiamonds(me.diamonds);
          }
          // Đồng thời cập nhật kim cương đối thủ nếu có thay đổi
          const op = eventData.players.find((p: any) => p.userId === opponentRef.current?.userId);
          if (op && op.diamonds !== undefined) {
            setOpponent(prev => prev ? { ...prev, diamonds: op.diamonds } : null);
          }
        }

        const winnerId = eventData?.winnerId;
        const opId = opponentRef.current?.userId;
        if (winnerId && eventName === 'vocab-battle:round-result') {
          if (winnerId === opId) setOpponentCorrectCount((p) => p + 1);
          else setMyCorrectCount((p) => p + 1);
        }
        break;
      case 'vocab-battle:game-over':
        stopRoundTimer('Trận đấu kết thúc 🏁');
        setMissingCardId(null);
        setIsInBattle(false);
        setIsSearchingBattle(false);
        const finalWinner = eventData?.winnerId;
        const finalOpId = opponentRef.current?.userId;

        // Cập nhật kim cương lần cuối lúc kết thúc game
        if (Array.isArray(eventData?.players)) {
          const me = eventData.players.find((p: any) => p.userId === userInfoRef.current.userId);
          if (me && me.diamonds !== undefined) setMyDiamonds(me.diamonds);
        }

        setOpponent(null);
        opponentRef.current = null;
        currentCardIdRef.current = null;
        let winUpdate = matchStatsRef.current.wins;
        let lossUpdate = matchStatsRef.current.losses;
        if (finalWinner && finalWinner !== finalOpId) {
          winUpdate++;
          pushLog('auth', '🏆 Kết quả', '🎉 BẠN CHIẾN THẮNG TRẬN ĐẤU!');
        } else if (finalWinner === finalOpId) {
          lossUpdate++;
          pushLog('error', '🏆 Kết quả', '💀 BẠN THẤT BẠI TRẬN ĐẤU!');
        }
        const newMatchStats = { wins: winUpdate, losses: lossUpdate };
        setMatchStats(newMatchStats);
        matchStatsRef.current = newMatchStats;
        localStorage.setItem('paroto_match_stats', JSON.stringify(newMatchStats));

        const shouldAutoSyncAfterBattle = autoSyncAfterBattleRef.current;
        const shouldAutoJoinNextBattle = autoJoinRef.current;

        if (shouldAutoSyncAfterBattle) {
          pushLog('auth', '🔁 Auto Load Data', 'Trận kết thúc -> tự động đồng bộ lại danh sách từ server.');
          loadCardsFromApi().finally(() => {
            if (shouldAutoJoinNextBattle) {
              pushLog('auth', '🔄 Auto-Join', 'Đã sync data xong -> tự động tìm trận mới.');
              setTimeout(() => emitJoinBattle(), 500);
            }
          });
        } else if (shouldAutoJoinNextBattle) {
          pushLog('auth', '🔄 Auto-Join', 'Hệ thống tự động tìm trận mới sau 2 giây...');
          setTimeout(() => emitJoinBattle(), 2000);
        }
        break;
    }
  };

  const triggerAutoSolver = (word: string) => {
    if (!autoSendRef.current) return;
    const len = word.length;
    let delay = 1000;
    if (len < 5) delay = Math.floor(Math.random() * 200) + 200;
    else if (len <= 8) delay = Math.floor(Math.random() * 400) + 600;
    else delay = Math.floor(Math.random() * 500) + 1000;
    pushLog('auth', '🤖 Auto-Solver', `Từ [${word}] (${len} ký tự) -> Tự gửi sau ${(delay / 1000).toFixed(2)}s`);
    setTimeout(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send('42' + JSON.stringify(['vocab-battle-answer', { answer: word }]));
        pushLog('out', '🎯 Gửi đáp án (Auto)', `["vocab-battle-answer", {"answer":"${word}"}]`);
        setAnswerInput('');
      }
    }, delay);
  };

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyFirebaseToken(e.target.value, 'Manual Input');
  };

  const connectSocket = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) return;
    manualDisconnectRef.current = false;
    setSocketStatus('connecting');
    const ws = new WebSocket(SOCKET_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      setSocketStatus('connected');
      failedConnectionsRef.current = 0;
      const tokenToUse = firebaseTokenRef.current.trim();
      if (tokenToUse) {
        ws.send(`40${JSON.stringify({ firebaseToken: tokenToUse })}`);
        pushLog('auth', '🔑 Token Authenticated', `UID kết nối: ${userInfoRef.current.userId}`);
      } else {
        ws.send('40');
      }

      if (pendingAutoJoinAfterReconnectRef.current) {
        pendingAutoJoinAfterReconnectRef.current = false;
        pushLog('auth', '⚔️ Auto Find Match', 'Socket đã kết nối lại -> tự động tìm trận đầu tiên.');
        setTimeout(() => {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            emitJoinBattle();
          }
        }, 800);
      }
    };

    ws.onmessage = (event) => {
      const raw = event.data;
      if (typeof raw !== 'string') return;
      if (raw === '2') {
        ws.send('3');
        return;
      }
      if (raw === '3') return;
      if (raw.startsWith('42')) {
        try {
          const parsed = JSON.parse(raw.substring(2));
          handleIncomingGameEvent(parsed[0], parsed[1]);
        } catch { /* ignore */ }
      }
    };

    ws.onerror = () => {
      pushLog('error', '🔴 Socket Error', 'Socket gặp lỗi kết nối. Hệ thống sẽ xử lý refresh token ở bước onclose.');
    };

    ws.onclose = async (event) => {
      setSocketStatus('disconnected');
      setIsInBattle(false);
      setIsSearchingBattle(false);
      stopRoundTimer('Mất kết nối Socket 🔴');

      if (manualDisconnectRef.current) {
        manualDisconnectRef.current = false;
        pendingAutoJoinAfterReconnectRef.current = false;
        return;
      }

      failedConnectionsRef.current += 1;
      pushLog(
        'error',
        '🔌 Socket Closed',
        `Socket bị ngắt/lỗi lần ${failedConnectionsRef.current}. Code=${event.code || 'N/A'}, reason=${event.reason || 'Không có'}`
      );

      // Bỏ cơ chế chờ lỗi 5 lần. Hễ socket lỗi là refresh token ngay, sau đó kết nối lại và tìm trận đầu tiên.
      if (autoRefreshTokenRef.current) {
        pushLog('auth', '🔄 Socket lỗi -> Refresh Token', 'Đang tự động refresh token ngay sau khi socket mất kết nối.');
        const success = await handleRefreshFirebaseToken();

        if (!success) {
          pendingAutoJoinAfterReconnectRef.current = false;
          pushLog('error', '🛑 Dừng kết nối lại', 'Không thể tự động Refresh Token. Hãy kiểm tra API Key / Refresh Token.');
          return;
        }

        pendingAutoJoinAfterReconnectRef.current = true;
        pushLog('auth', '🔁 Reconnect + Find Match', 'Refresh token thành công -> tự động kết nối lại socket và tìm trận đầu tiên.');
        setTimeout(() => {
          if (socketRef.current?.readyState !== WebSocket.OPEN && socketRef.current?.readyState !== WebSocket.CONNECTING) {
            connectSocket();
          }
        }, 1000);
        return;
      }

      if (autoConnectRef.current) {
        pushLog('auth', '🔁 Auto Connect', 'Auto Refresh Token đang tắt -> chỉ thử kết nối lại sau 2 giây.');
        setTimeout(() => {
          if (autoConnectRef.current && socketRef.current?.readyState !== WebSocket.OPEN) connectSocket();
        }, 2000);
      }
    };
  };

  const disconnectSocket = () => {
    if (socketRef.current) {
      manualDisconnectRef.current = true;
      failedConnectionsRef.current = 0; // Chủ động ngắt thì không tính lỗi
      pendingAutoJoinAfterReconnectRef.current = false;
      socketRef.current.close();
      pushLog('auth', '🔌 Disconnect', 'Chủ động ngắt kết nối socket.');
    }
  };

  const emitJoinBattle = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send('42["join-vocab-battle"]');
      setIsSearchingBattle(true);
      pushLog('out', '⚔️ Tìm trận', '["join-vocab-battle"]');
    }
  };

  const sendManualAnswer = () => {
    if (!answerInput.trim() || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send('42' + JSON.stringify(['vocab-battle-answer', { answer: answerInput.trim() }]));
    pushLog('out', '🎯 Gửi đáp án (Manual)', `["vocab-battle-answer", {"answer":"${answerInput.trim()}"}]`);
    setAnswerInput('');
  };

  const filteredServerCards = useMemo(() => {
    if (!serverSearch.trim()) return serverCards;
    const keyword = serverSearch.toLowerCase();
    return serverCards.filter(
      (c) => c.card_id.toLowerCase().includes(keyword) || c.word.toLowerCase().includes(keyword)
    );
  }, [serverCards, serverSearch]);


  const loadBotQueueStatus = async (silent = false) => {
    if (!silent) setIsLoadingBotQueue(true);

    try {
      const res = await axios.get(`${API_BASE_URL}/bot-queue/status`, { timeout: 8000 });
      const normalized = normalizeBotQueueResponse(res.data);
      setBotQueueStatus(normalized);

      if (!silent) {
        pushLog('auth', '🤖 Bot Queue Status', `Đã tải trạng thái ${normalized.bots.length} bot từ Go server.`);
      }
    } catch (err: any) {
      if (!silent) {
        pushLog('error', '🔴 Bot Queue Status Error', err.response?.data?.message || err.message);
      }
    } finally {
      if (!silent) setIsLoadingBotQueue(false);
    }
  };

  const startBotQueue = async () => {
    if (!botQueueInputBots.length) {
      pushLog('error', '🔴 Bot Queue', 'Danh sách bot đang trống. Mỗi dòng cần là 1 Firebase Token hoặc botId|FirebaseToken.');
      return;
    }

    const invalidBots = botQueueInputBots.filter((bot) => bot.userId === DEFAULT_USER_INFO.userId);
    if (invalidBots.length > 0) {
      pushLog('error', '🔴 Bot Queue', `Có ${invalidBots.length} bot không decode được UID. Kiểm tra lại Firebase Token.`);
      return;
    }

    setIsStartingBotQueue(true);

    try {
      const delayAfterGameStartMs = Math.max(0, Number(botQueueDelayMs) || 1000);
      localStorage.setItem('paroto_bot_queue_list', botQueueText);
      localStorage.setItem('paroto_bot_queue_delay_ms', String(delayAfterGameStartMs));

      const payload = {
        delayAfterGameStartMs,
        bots: botQueueInputBots.map((bot) => ({
          botId: bot.botId,
          firebaseToken: bot.firebaseToken,
        })),
      };

      const res = await axios.post(`${API_BASE_URL}/bot-queue/start`, payload, { timeout: 12000 });
      const normalized = normalizeBotQueueResponse(res.data);
      setBotQueueStatus(normalized);
      pushLog('auth', '▶️ Bot Queue Start', `Đã gửi ${botQueueInputBots.length} bot lên Go server. Delay=${delayAfterGameStartMs}ms.`);

      await loadBotQueueStatus(true);
    } catch (err: any) {
      pushLog('error', '🔴 Bot Queue Start Error', err.response?.data?.message || err.message);
    } finally {
      setIsStartingBotQueue(false);
    }
  };

  const stopBotQueue = async () => {
    setIsStoppingBotQueue(true);

    try {
      const res = await axios.post(`${API_BASE_URL}/bot-queue/stop`, {}, { timeout: 8000 });
      const normalized = normalizeBotQueueResponse(res.data);
      setBotQueueStatus(normalized);
      pushLog('auth', '⏹️ Bot Queue Stop', 'Đã gửi lệnh dừng hàng chờ bot tới Go server.');
      await loadBotQueueStatus(true);
    } catch (err: any) {
      pushLog('error', '🔴 Bot Queue Stop Error', err.response?.data?.message || err.message);
    } finally {
      setIsStoppingBotQueue(false);
    }
  };

  const getBotQueueRowInfo = (bot: BotQueueServerBot) => {
    const botId = bot.botId || bot.bot_id || '--';
    const inputBot = botQueueInputBots.find((item) => item.botId === botId);

    return {
      botId,
      userId: bot.userId || bot.user_id || inputBot?.userId || '--',
      email: bot.email || inputBot?.email || '--',
      status: bot.status || 'unknown',
      lastEvent: bot.lastEvent || bot.last_event || bot.message || '--',
      retryCount: bot.retryCount ?? bot.retry_count ?? 0,
      updatedAt: bot.updatedAt || bot.updated_at || bot.startedAt || bot.started_at || '--',
    };
  };

  const exportCollectedJson = () => {
    if (!collectedVocabs.length) return;
    const blob = new Blob([JSON.stringify(collectedVocabs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paroto_collected_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-6 selection:bg-sky-200">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200 shadow-sm">
              <Zap className="h-5 w-5 text-sky-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800 md:text-2xl">
                Paroto Monitor & Solver
              </h1>
              <p className="text-xs text-slate-500">WebSocket battle client</p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="hidden border-slate-200 bg-white font-mono text-xs text-slate-500 sm:inline-flex"
          >
            v2026.Next
          </Badge>
        </div>

        {/* Connection & Auth Card */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full shadow-sm ${socketStatus === 'connected'
                    ? 'bg-emerald-500 shadow-emerald-200'
                    : socketStatus === 'connecting'
                      ? 'bg-amber-500 shadow-amber-200 animate-pulse'
                      : 'bg-rose-500 shadow-rose-200'
                    }`}
                />
                <span className="text-sm font-semibold capitalize tracking-wide text-slate-700">{socketStatus}</span>
                {isMounted && (
                  <span className="hidden font-mono text-xs text-slate-400 select-all lg:inline">{SOCKET_URL}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-700">
                  <Checkbox
                    id="autoConnect"
                    checked={autoConnect}
                    onCheckedChange={(c) => handleSetAutoConnect(!!c)}
                    className="border-emerald-300 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                  />
                  <label htmlFor="autoConnect" className="cursor-pointer select-none">
                    🟢 Tự động kết nối
                  </label>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  onClick={connectSocket}
                  disabled={socketStatus !== 'disconnected'}
                >
                  <Activity className="mr-1.5 h-4 w-4 text-emerald-500" /> Kết nối
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  onClick={emitJoinBattle}
                  disabled={socketStatus !== 'connected' || isInBattle || isSearchingBattle}
                >
                  <Shield className="mr-1.5 h-4 w-4 text-violet-500" />
                  {isSearchingBattle ? 'Đang tìm trận...' : 'Tìm trận'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  onClick={loadCardsFromApi}
                  disabled={isLoadingServerCards}
                >
                  <RefreshCw className={`mr-1.5 h-4 w-4 text-sky-500 ${isLoadingServerCards ? 'animate-spin' : ''}`} />
                  {isLoadingServerCards ? 'Đang load...' : 'Load data'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  onClick={disconnectSocket}
                  disabled={socketStatus === 'disconnected'}
                >
                  <X className="mr-1.5 h-4 w-4 text-rose-500" /> Ngắt
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => {
                    setEvents([]);
                    setCollectedVocabs([]);
                  }}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> Xóa log
                </Button>
              </div>
            </div>

            {/* Inputs Block (Firebase Token + API Key / Refresh Token) */}
            <div className="grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-4">
              <div className="space-y-1">
                <label className="font-mono text-xs font-semibold text-slate-500">Firebase Access Token:</label>
                <Input
                  type="text"
                  value={firebaseToken}
                  onChange={handleTokenChange}
                  placeholder="Paste access_token (JWT)..."
                  className="h-9 border-slate-200 bg-white font-mono text-xs placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-xs font-semibold text-slate-500">Google API Key:</label>
                <Input
                  type="text"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    localStorage.setItem('paroto_api_key', e.target.value);
                  }}
                  placeholder="AIzaSyDy3B5322..."
                  className="h-9 border-slate-200 bg-white font-mono text-xs placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-xs font-semibold text-slate-500">Refresh Token:</label>
                <Input
                  type="text"
                  value={refreshToken}
                  onChange={(e) => {
                    setRefreshToken(e.target.value);
                    localStorage.setItem('paroto_refresh_token', e.target.value);
                  }}
                  placeholder="AMf-vBz9PMLTHiakB..."
                  className="h-9 border-slate-200 bg-white font-mono text-xs placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-xs font-semibold text-rose-500">UID tự động out:</label>
                <Input
                  type="text"
                  value={avoidUserIds}
                  onChange={handleAvoidUserIdsChange}
                  placeholder="Nhập UID cần né..."
                  className="h-9 border-rose-200 bg-white font-mono text-xs text-rose-700 placeholder:text-rose-300 focus:border-rose-400 focus:ring-rose-400/20"
                />
                <p className="text-[10px] text-slate-400">Có thể nhập nhiều UID, cách nhau bằng dấu phẩy hoặc khoảng trắng.</p>
              </div>
            </div>

            {/* Auth Info Status & Configurations */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-500">
              <div className="flex items-center gap-4">
                <span>UID: <span className="font-bold text-sky-600">{userInfo.userId}</span></span>
                <span>Email: <span className="font-bold text-sky-600">{userInfo.email}</span></span>
                {avoidUserIds.trim() && (
                  <span className="font-bold text-rose-500">Auto out UID: {avoidUserIds}</span>
                )}
                {failedConnectionsRef.current > 0 && (
                  <span className="text-rose-500 font-bold">Lỗi socket: {failedConnectionsRef.current} lần</span>
                )}
              </div>

              <div className="flex items-center gap-3 border-l pl-3 border-slate-200">
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="autoRefreshToken"
                    checked={autoRefreshToken}
                    onCheckedChange={(c) => handleSetAutoRefreshToken(!!c)}
                    className="border-slate-300 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                  />
                  <label htmlFor="autoRefreshToken" className="cursor-pointer select-none font-sans font-semibold text-amber-600">
                    🔄 Auto Refresh Token (Khi socket lỗi)
                  </label>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-amber-200 text-amber-700 hover:bg-amber-50 text-[11px]"
                  onClick={handleRefreshFirebaseToken}
                  disabled={isRefreshing}
                >
                  <KeyRound className={`mr-1 h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Force Refresh Now
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>


        {/* Bot Queue Manager */}
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="flex items-center justify-between gap-3 text-sm font-bold text-slate-700">
              <span className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-sky-500" /> Bot Queue Manager
              </span>
              <Badge
                variant="outline"
                className={`font-mono text-[11px] ${botQueueStatus?.running ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}
              >
                {botQueueStatus?.running ? 'RUNNING' : 'IDLE'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2 lg:col-span-1">
                <label className="font-mono text-xs font-semibold text-slate-500">Danh sách bot:</label>
                <textarea
                  value={botQueueText}
                  onChange={(e) => {
                    setBotQueueText(e.target.value);
                    localStorage.setItem('paroto_bot_queue_list', e.target.value);
                  }}
                  placeholder={`Mỗi dòng là 1 bot.\nCách 1: FirebaseToken\nCách 2: bot_1|FirebaseToken`}
                  className="min-h-[180px] w-full rounded-md border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Client chỉ gửi danh sách bot lên Go server. Server sẽ điều phối: bot trước vào trận thì bot sau mới được đưa vào hàng chờ.
                </p>
              </div>

              <div className="space-y-3 lg:col-span-2">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tổng bot</div>
                    <div className="mt-1 text-xl font-bold text-slate-700">{botQueueSummary.total}</div>
                  </div>
                  <div className="rounded-lg border border-sky-100 bg-sky-50 p-3 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-600">Đang tìm</div>
                    <div className="mt-1 text-xl font-bold text-sky-700">{botQueueSummary.searching}</div>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Trong trận</div>
                    <div className="mt-1 text-xl font-bold text-emerald-700">{botQueueSummary.inBattle}</div>
                  </div>
                  <div className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-600">Lỗi</div>
                    <div className="mt-1 text-xl font-bold text-rose-700">{botQueueSummary.error}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <label className="whitespace-nowrap text-xs font-semibold text-slate-500">Delay sau game-start:</label>
                    <Input
                      type="number"
                      min={0}
                      value={botQueueDelayMs}
                      onChange={(e) => {
                        setBotQueueDelayMs(e.target.value);
                        localStorage.setItem('paroto_bot_queue_delay_ms', e.target.value);
                      }}
                      className="h-8 w-28 border-slate-200 bg-white font-mono text-xs"
                    />
                    <span className="text-xs text-slate-400">ms</span>
                  </div>

                  <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                    <Checkbox
                      id="botQueueAutoRefresh"
                      checked={botQueueAutoRefresh}
                      onCheckedChange={(c) => handleSetBotQueueAutoRefresh(!!c)}
                      className="border-slate-300 data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
                    />
                    <label htmlFor="botQueueAutoRefresh" className="cursor-pointer select-none text-xs font-semibold text-sky-600">
                      Tự refresh trạng thái
                    </label>
                  </div>

                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="bg-sky-500 text-white hover:bg-sky-600"
                      onClick={startBotQueue}
                      disabled={isStartingBotQueue || botQueueInputBots.length === 0}
                    >
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      {isStartingBotQueue ? 'Đang start...' : 'Start Queue'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      onClick={() => loadBotQueueStatus(false)}
                      disabled={isLoadingBotQueue}
                    >
                      <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isLoadingBotQueue ? 'animate-spin' : ''}`} />
                      Status
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                      onClick={stopBotQueue}
                      disabled={isStoppingBotQueue}
                    >
                      <Square className="mr-1.5 h-3.5 w-3.5" />
                      {isStoppingBotQueue ? 'Đang dừng...' : 'Stop'}
                    </Button>
                  </div>
                </div>

                <div className="max-h-[280px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/40">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-white shadow-sm">
                      <TableRow className="border-slate-200 hover:bg-transparent">
                        <TableHead className="w-[14%] text-xs font-semibold text-slate-600">Bot</TableHead>
                        <TableHead className="w-[20%] text-xs font-semibold text-slate-600">UID</TableHead>
                        <TableHead className="w-[22%] text-xs font-semibold text-slate-600">Email</TableHead>
                        <TableHead className="w-[16%] text-xs font-semibold text-slate-600">Trạng thái</TableHead>
                        <TableHead className="w-[20%] text-xs font-semibold text-slate-600">Event cuối</TableHead>
                        <TableHead className="w-[8%] text-xs font-semibold text-slate-600">Retry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {botQueueDisplayRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-xs text-slate-500">
                            <ListChecks className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                            Chưa có bot nào. Dán danh sách bot ở ô bên trái rồi nhấn Start Queue.
                          </TableCell>
                        </TableRow>
                      ) : (
                        botQueueDisplayRows.map((bot, idx) => {
                          const row = getBotQueueRowInfo(bot);
                          return (
                            <TableRow key={`${row.botId}-${idx}`} className="border-slate-100 font-mono text-xs hover:bg-white">
                              <TableCell className="font-bold text-slate-700">{row.botId}</TableCell>
                              <TableCell className="max-w-[180px] truncate text-slate-500" title={row.userId}>{row.userId}</TableCell>
                              <TableCell className="max-w-[180px] truncate text-slate-500" title={row.email}>{row.email}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`font-sans text-[11px] ${getBotQueueStatusClass(row.status)}`}>
                                  {getBotQueueStatusLabel(row.status)}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-[220px] truncate text-slate-500" title={row.lastEvent}>{row.lastEvent}</TableCell>
                              <TableCell className="text-center text-slate-500">{row.retryCount}</TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-100 bg-white px-3 py-2 text-[11px] text-slate-500">
                  <span>Active searching: <b className="font-mono text-sky-600">{botQueueStatus?.activeSearching || botQueueStatus?.active_searching || '--'}</b></span>
                  <span>Waiting: <b className="font-mono text-slate-700">{botQueueSummary.waiting}</b></span>
                  <span>Stopped: <b className="font-mono text-slate-700">{botQueueSummary.stopped}</b></span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main grid: Battle + Opponent */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* Timer / Word Card */}
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
              <div className="relative h-1.5 bg-slate-100">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-sky-400"
                  animate={{ width: `${(timeLeft / 30) * 100}%` }}
                  transition={{ duration: 1, ease: 'linear' }}
                  style={{
                    background: timeLeft <= 10
                      ? 'linear-gradient(90deg, #f43f5e, #f59e0b)'
                      : undefined,
                  }}
                />
              </div>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-center rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                  {timerMessage}
                </div>

                {missingCardId && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-rose-200 bg-rose-50 p-3 font-mono text-xs text-rose-700"
                  >
                    ⚠️ Không tìm thấy từ vựng cho{' '}
                    <span className="font-bold underline">card_id: {missingCardId}</span> trên Server API!
                  </motion.div>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                      Trận đấu
                    </span>
                    <div className="text-lg font-bold text-slate-700">{roundText}</div>
                  </div>
                  <div className="space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                      Mặt nạ từ
                    </span>
                    <div className="text-lg font-bold tracking-wider text-sky-600">{wordMask}</div>
                  </div>
                  <div className="space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <span className="block text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                      Nghĩa tiếng Việt
                    </span>
                    <div className="text-lg font-bold text-emerald-600">{wordMeaning}</div>
                  </div>
                </div>

                <div className="space-y-1 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                  <span className="block text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    Ví dụ ẩn từ
                  </span>
                  <div
                    className="select-all text-sm italic leading-relaxed text-slate-600"
                    dangerouslySetInnerHTML={{
                      __html: `${wordExample.en}<br/><small class="text-slate-400">→ ${wordExample.vi}</small>`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Answer Input */}
            <Card className="border-emerald-200 bg-emerald-50/30 shadow-sm">
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <span className="whitespace-nowrap text-xs font-bold uppercase tracking-wider text-emerald-600">
                  Đáp án:
                </span>
                <Input
                  type="text"
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendManualAnswer()}
                  placeholder="Nhập đáp án..."
                  className="h-10 flex-1 border-emerald-200 bg-white font-mono text-sm font-bold text-emerald-700 placeholder:text-emerald-300 focus:border-emerald-400 focus:ring-emerald-400/20"
                />
                <Button
                  size="sm"
                  className="bg-emerald-500 font-bold text-white hover:bg-emerald-600 shadow-sm"
                  onClick={sendManualAnswer}
                >
                  <Send className="h-4 w-4" />
                </Button>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Checkbox id="autoSend" checked={autoSend} onCheckedChange={(c) => handleSetAutoSend(!!c)} className="border-slate-300 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500" />
                    <label htmlFor="autoSend" className="cursor-pointer select-none text-xs font-medium text-slate-600">
                      🤖 Auto Answer
                    </label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Checkbox id="autoJoin" checked={autoJoin} onCheckedChange={(c) => handleSetAutoJoin(!!c)} className="border-slate-300 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500" />
                    <label htmlFor="autoJoin" className="cursor-pointer select-none text-xs font-medium text-violet-600">
                      🔄 Tự tìm trận
                    </label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="autoSyncAfterBattle"
                      checked={autoSyncAfterBattle}
                      onCheckedChange={(c) => handleSetAutoSyncAfterBattle(!!c)}
                      className="border-slate-300 data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
                    />
                    <label htmlFor="autoSyncAfterBattle" className="cursor-pointer select-none text-xs font-medium text-sky-600">
                      🔁 Auto sync data
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Opponent & Self Diamonds Card */}
          <Card className="border-slate-200 bg-white shadow-sm flex flex-col justify-between">
            <div>
              <CardHeader className="pb-2 border-b border-slate-100">
                <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Users className="h-4 w-4" /> Trạng thái người chơi
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {/* My Diamonds Widget */}
                <div className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-xs font-medium">
                  <span className="text-amber-800 flex items-center gap-1.5">
                    <Gem className="h-4 w-4 text-amber-500" /> Kim cương của bạn:
                  </span>
                  <span className="font-mono text-sm font-bold text-amber-600">
                    {myDiamonds !== null ? `${myDiamonds.toLocaleString('vi-VN')} 🔷` : '---'}
                  </span>
                </div>

                {/* Opponent Block */}
                {opponent ? (
                  <div className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    {opponent.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={opponent.photoURL}
                        className="h-14 w-14 rounded-full border-2 border-sky-200 object-cover bg-white"
                        alt="avatar"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-sky-200 bg-sky-50 text-xl font-black text-sky-600">
                        {opponent.displayName?.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-bold text-slate-800">{opponent.displayName}</span>
                        {opponent.isPremium && (
                          <Badge className="h-4 bg-violet-100 px-1.5 text-[9px] text-violet-700 border-violet-200 hover:bg-violet-200">Premium</Badge>
                        )}
                      </div>
                      <div className="truncate font-mono text-[11px] text-slate-500">UID: {opponent.userId}</div>
                      <div className="text-xs font-medium text-sky-600">
                        🔷 {opponent.diamonds?.toLocaleString('vi-VN') || 0} kim cương
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center text-sm font-medium text-slate-400 bg-slate-50">
                    <User className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                    Chưa vào trận đấu...
                  </div>
                )}
              </CardContent>
            </div>
          </Card>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {[
            { label: 'Tổng sự kiện', val: stats.total, color: 'text-sky-600' },
            { label: 'Gói tin nhận', val: stats.received, color: 'text-blue-600' },
            { label: 'Gói tin gửi', val: stats.sent, color: 'text-violet-600' },
            { label: 'Bạn đúng', val: myCorrectCount, color: 'text-emerald-600' },
            { label: 'Địch đúng', val: opponentCorrectCount, color: 'text-rose-600' },
            { label: 'W/L', val: `${matchStats.wins}W - ${matchStats.losses}L`, color: 'text-amber-500' },
          ].map((s, idx) => (
            <Card key={idx} className="border-slate-200 bg-white shadow-sm">
              <CardContent className="space-y-1 p-4 text-center">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {s.label}
                </span>
                <span className={`block text-xl font-bold ${s.color}`}>{s.val}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="events">
          <TabsList className="h-11 w-full justify-start rounded-b-none border border-slate-200 bg-white p-1">
            <TabsTrigger
              value="events"
              className="px-4 text-xs font-semibold text-slate-500 data-[state=active]:bg-slate-100 data-[state=active]:text-slate-800"
            >
              Event Log ({events.length})
            </TabsTrigger>
            <TabsTrigger
              value="collected"
              className="px-4 text-xs font-semibold text-slate-500 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700"
            >
              Thu thập ({collectedVocabs.length})
            </TabsTrigger>
            <TabsTrigger
              value="server"
              className="px-4 text-xs font-semibold text-slate-500 data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700"
            >
              Server ({serverCards.length})
            </TabsTrigger>
          </TabsList>

          {/* Events Tab */}
          <TabsContent
            value="events"
            className="max-h-[480px] overflow-y-auto rounded-b-xl rounded-tr-xl border border-t-0 border-slate-200 bg-white p-4 shadow-sm"
          >
            <AnimatePresence initial={false}>
              {events.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center">
                  <Activity className="h-8 w-8 text-slate-300 mb-2" />
                  Chưa có gói tin nào. Nhấn Kết nối để bắt đầu.
                </div>
              ) : (
                events.map((e) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className={`mb-2 rounded-lg border p-3 font-mono text-xs leading-relaxed ${e.direction === 'error'
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : e.direction === 'auth'
                        ? 'border-violet-200 bg-violet-50 text-violet-700'
                        : e.direction === 'out'
                          ? 'border-indigo-100 bg-indigo-50/50 text-indigo-700'
                          : 'border-slate-100 bg-slate-50 text-slate-600'
                      }`}
                  >
                    <div className="mb-1 flex items-center gap-2 border-b border-slate-200/50 pb-1 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {e.time}</span>
                      <span
                        className={`font-bold uppercase ${e.direction === 'in'
                          ? 'text-sky-600'
                          : e.direction === 'out'
                            ? 'text-violet-600'
                            : 'text-amber-600'
                          }`}
                      >
                        [{e.direction}]
                      </span>
                      <span className="font-medium text-slate-600">{e.type}</span>
                    </div>
                    <div className="max-h-32 overflow-y-auto break-all mt-1">
                      {typeof e.data === 'string' ? e.data : JSON.stringify(e.data, null, 2)}
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </TabsContent>

          {/* Collected Tab */}
          <TabsContent
            value="collected"
            className="rounded-b-xl rounded-tr-xl border border-t-0 border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                onClick={exportCollectedJson}
                disabled={!collectedVocabs.length}
              >
                <Download className="mr-1 h-3.5 w-3.5" /> Xuất JSON
              </Button>
            </div>
            <div className="max-h-[380px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-white shadow-sm">
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="w-1/3 text-xs font-semibold text-slate-600">Card ID</TableHead>
                    <TableHead className="w-1/3 text-xs font-semibold text-slate-600">Từ vựng</TableHead>
                    <TableHead className="w-1/3 text-xs font-semibold text-slate-600">Lưu lúc</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collectedVocabs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-xs text-slate-500">
                        Chưa thu thập từ mới.
                      </TableCell>
                    </TableRow>
                  ) : (
                    collectedVocabs.map((v, i) => (
                      <TableRow key={i} className="border-slate-100 font-mono text-xs hover:bg-slate-100/50">
                        <TableCell className="select-all text-slate-500">{v.cardId}</TableCell>
                        <TableCell className="select-all text-sm font-bold text-emerald-600">{v.word}</TableCell>
                        <TableCell className="text-slate-500">{v.time}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Server Data Tab */}
          <TabsContent
            value="server"
            className="space-y-3 rounded-b-xl rounded-tr-xl border border-t-0 border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                API:{' '}
                <Badge className="border-slate-200 bg-white font-mono text-amber-600">{serverDataStatus}</Badge>
                <span className="font-mono text-[11px] text-slate-400">Sync: {serverLastSyncTime}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-sky-200 bg-white text-xs font-semibold text-sky-600 hover:bg-sky-50 hover:text-sky-700"
                  onClick={loadCardsFromApi}
                  disabled={isLoadingServerCards}
                >
                  <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isLoadingServerCards ? 'animate-spin' : ''}`} />
                  {isLoadingServerCards ? 'Đang sync...' : 'Load data'}
                </Button>
              </div>
              <div className="relative flex w-full max-w-sm flex-1 items-center">
                <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Tìm ID hoặc từ khóa..."
                  value={serverSearch}
                  onChange={(e) => setServerSearch(e.target.value)}
                  className="h-9 border-slate-200 bg-white pl-8 font-mono text-xs placeholder:text-slate-400 focus:ring-sky-500/20 focus:border-sky-500"
                />
                {serverSearch && (
                  <button
                    onClick={() => setServerSearch('')}
                    className="absolute right-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[380px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-white shadow-sm">
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="w-[10%] text-xs font-semibold text-slate-600">Id</TableHead>
                    <TableHead className="w-[35%] text-xs font-semibold text-slate-600">Card ID</TableHead>
                    <TableHead className="w-[40%] text-xs font-semibold text-slate-600">Từ vựng</TableHead>
                    <TableHead className="w-[15%] text-xs font-semibold text-slate-600">Nguồn</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredServerCards.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-xs text-slate-500">
                        Không có dữ liệu phù hợp.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredServerCards.slice(0, 300).map((c, idx) => (
                      <TableRow key={idx} className="border-slate-100 font-mono text-xs hover:bg-slate-100/50">
                        <TableCell className="text-slate-500">{c.id ?? '--'}</TableCell>
                        <TableCell className="select-all text-slate-500">{c.card_id}</TableCell>
                        <TableCell className="select-all text-sm font-bold text-emerald-600">{c.word}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              c.source === 'new'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }
                          >
                            {c.source}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}