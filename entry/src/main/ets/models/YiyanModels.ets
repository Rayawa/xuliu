export interface YiyanCard { provider: string; id: string; text: string; source: string; image: string; publishedAt: string; }
export interface YiyanLibraryCard { id: string; text: string; source: string; image: string; publishedAt: string; }
export interface YiyanBook { id: string; name: string; count: number; private: boolean | null; image: string; }
export interface YiyanResponse {
  connected?: boolean; pending?: boolean; libraryReady?: boolean; retryAfter?: number; card?: YiyanCard;
  books?: YiyanBook[]; defaultBookId?: string | null; cards?: YiyanLibraryCard[]; nextCursor?: string | null;
  book?: YiyanBook; saved?: boolean; cardId?: string; recovered?: boolean; sent?: boolean;
}
export interface YiyanAction { action: string; phone?: string; code?: string; requestId?: string; cardId?: string; bookId?: string; name?: string; visibility?: string; checkOnly?: string; }
export interface YiyanOperation { kind: string; body: YiyanAction; collect: boolean; cardId?: string; }
export interface YiyanView {
  card?: YiyanCard; connected: boolean; checking: boolean; busy: string; notice: string; loginOpen: boolean;
  codeSent: boolean; retryAt: number; refreshAt: number; books: YiyanBook[]; defaultBookId: string; selected?: YiyanBook;
  cards: YiyanLibraryCard[]; cursor: string; page: number; library: string; pending?: YiyanOperation; saved: string[]; needsReconnect: boolean;
}
export function emptyYiyanView(): YiyanView {
  return { connected: false, checking: false, busy: '', notice: '', loginOpen: false, codeSent: false, retryAt: 0, refreshAt: 0,
    books: [], defaultBookId: '', cards: [], cursor: '', page: 1, library: '', saved: [], needsReconnect: false };
}
