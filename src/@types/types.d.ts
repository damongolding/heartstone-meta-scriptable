declare interface Archetype {
  id: number;
  name: string;
  player_class: number;
  player_class_name: string;
  url: string;
  standard_ccp_signature_core: StandardCcpSignatureCore | null;
  wild_ccp_signature_core: null;
}

declare interface StandardCcpSignatureCore {
  as_of: string;
  format: number;
  components: number[];
}

declare interface HsReplayDeckData {
  render_as: string;
  series: Series;
  as_of: string;
}

declare interface Series {
  metadata: Metadata;
  data: Data;
}

declare interface Data {
  [key: string]: DeckData[];
}

declare interface DeckData {
  archetype_id: number;
  total_games: number;
  pct_of_class: number;
  pct_of_total: number;
  win_rate: number | string;
}

declare interface Metadata {
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

declare interface ClassMetadata {}

declare interface Settings {
  assetsBaseUrl: string;
  tierFloors: TierFloors;
}

declare interface TierFloors {
  T1: number;
  T2: number;
  T3: number;
  T4: number;
}

declare interface CombinedDeckData extends DeckData {
  archetype: Archetype | undefined;
}

declare interface PlayerClassIcons {
  [key: string]: Image;
}

declare interface DecksInTiers {
  [key: string]: CombinedDeckData[];
}

declare type FlattenedTiers = (string | CombinedDeckData)[];

declare type SkinBackgroundColour = { [key: string]: Color };
