
export enum MaterialType {
  TERRESTRE = "Salv. Terrestre/Altura",
  INCENDIO = "Incêndio Urbano",
  FLORESTAL = "Florestal",
  APH = "APH",
  AQUATICO = "Salv. Aquático/Mergulho",
  FERRAMENTAS = "Ferramentas diversas",
  OUTROS = "Outros"
}

export enum MovementStatus {
  PENDENTE = "PENDENTE",
  DEVOLVIDO = "DEVOLVIDO"
}

export interface MilitaryPerson {
  bm: string;
  name: string;
  warName: string;
  rank: string;
  cpf: string;
}

export interface Movement {
  id: string;
  bm: string;
  name: string;
  warName: string;
  rank: string;
  dateCheckout: string;
  estimatedReturnDate?: string;
  material: string;
  origin?: string; // Novo campo para local de retirada (SAO, Viatura, etc.)
  type: MaterialType;
  status: MovementStatus;
  dateReturn?: string;
  observations?: string;
  reason?: string;
  receiverBm?: string;
  receiverName?: string;
  receiverWarName?: string;
  receiverRank?: string;
  dutyOfficerBm?: string;
  dutyOfficerName?: string;
  image?: string; // Campo opcional para foto em Base64
}

export interface AuthState {
  user: MilitaryPerson | null;
  isVisitor: boolean;
}

export type UnitID = 'SEDE' | 'PEMAD';

export interface UnitConfig {
  id: UnitID;
  name: string;
  shortName: string;
  defaultSheetUrl: string;
  theme: 'red' | 'orange';
}
