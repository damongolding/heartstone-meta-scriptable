export interface Archetypes {
  id: number;
  name: string;
  player_class: number;
  player_class_name: PlayerClassName;
  url: string;
  standard_ccp_signature_core: StandardCcpSignatureCore | null;
  wild_ccp_signature_core: null;
}

export enum PlayerClassName {
  Deathknight = "DEATHKNIGHT",
  Demonhunter = "DEMONHUNTER",
  Druid = "DRUID",
  Hunter = "HUNTER",
  Mage = "MAGE",
  Neutral = "NEUTRAL",
  Paladin = "PALADIN",
  Priest = "PRIEST",
  Rogue = "ROGUE",
  Shaman = "SHAMAN",
  Warlock = "WARLOCK",
  Warrior = "WARRIOR",
  Whizbang = "WHIZBANG",
}

export interface StandardCcpSignatureCore {
  as_of: string;
  format: number;
  components: number[];
}

export interface HsReplayDeckData {
  render_as: string;
  series: Series;
  as_of: string;
}

export interface Series {
  metadata: Metadata;
  data: Data;
}

export interface Data {
  [key: string]: DeckData[];
}

export interface DeckData {
  archetype_id: number;
  total_games: number;
  pct_of_class: number;
  pct_of_total: number;
  win_rate: number | string;
}

export interface Metadata {
  DEMONHUNTER: ClassMetadata;
  DRUID: ClassMetadata;
  HUNTER: ClassMetadata;
  MAGE: ClassMetadata;
  PALADIN: ClassMetadata;
  PRIEST: ClassMetadata;
  ROGUE: ClassMetadata;
  SHAMAN: ClassMetadata;
  WARLOCK: ClassMetadata;
  WARRIOR: ClassMetadata;
}

export interface ClassMetadata {}

export interface Settings {
  tierFloors: TierFloors;
}

export interface TierFloors {
  T1: number;
  T2: number;
  T3: number;
  T4: number;
}

export interface CombinedDeckData extends DeckData {
  archetype: Archetypes;
}

export interface PlayerClassIcons {
  [key: string]: Image;
}

export interface Tiers {
  [key: string]: CombinedDeckData[];
}
