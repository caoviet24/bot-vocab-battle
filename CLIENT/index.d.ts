interface LogEvent {
  direction: "in" | "out" | "auth" | "error";
  type: string;
  data: any;
  time: string;
  id: string;
}

interface ServerCard {
  id: number | null;
  card_id: string;
  word: string;
  source: string;
}

interface CollectedVocab {
  cardId: string;
  word: string;
  time: string;
}

interface Opponent {
  userId?: string;
  displayName?: string;
  photoURL?: string;
  diamonds?: number;
  isPremium?: boolean;
}