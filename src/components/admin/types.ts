export type AdminLeague = {
  id: string;
  name: string;
  slug: string;
  totalRounds: number;
  maxPlayers: number;
  songsPerPlayerPerRound: number;
  status: "active" | "ended";
  startDate: string | null;
  endDate: string | null;
};

export type AdminImportBatch = {
  id: string;
  leagueId: string;
  leagueName: string;
  status: "pending" | "processing" | "completed" | "failed";
  receivedRows: number;
  receivedChunks: number;
  summary: {
    competitors: number;
    memberships: number;
    rounds: number;
    submissions: number;
    votes: number;
  } | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};
