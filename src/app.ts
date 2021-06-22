import type {
  Settings,
  Archetypes,
  HsReplayDeckData,
  CombinedDeckData,
  DeckData,
  PlayerClassIcons,
  Tiers,
} from "./@types";

const settings: Settings = {
  tierFloors: {
    T1: 55,
    T2: 50,
    T3: 45,
    T4: 0,
  },
};

const theme = {
  classImageUrl: (playerClass: string) =>
    `https://static.hsreplay.net/static/images/64x/class-icons/${playerClass.toLowerCase()}.png`,
  colours: {
    white: new Color("#fff", 0.1),
    grey: new Color("#eee", 1),
    green: new Color("#22A117", 1),
    orange: new Color("#F48100", 1),
    red: new Color("#FF5050", 1),
    blue: new Color("#1d3657", 1),
  },
  font: {
    widget: {
      deckName: Font.systemFont(14),
      deckWinRate: Font.boldSystemFont(18),
    },
    table: {
      deckName: Font.systemFont(18),
      deckWinRate: Font.boldSystemFont(25),
    },
  },
};

/**
 * See if class icons are saved locally, if not grab and save them then return the local version
 * @param playerClasses
 * @returns : [Images]
 */
async function storeAndRetrieveClassIcons(
  playerClasses: string[]
): Promise<PlayerClassIcons> {
  const manager = FileManager.local();
  const localPath = manager.libraryDirectory();
  let playerClassIcons: PlayerClassIcons = {};

  for await (let playerClass of playerClasses) {
    playerClass = playerClass.toLowerCase();

    if (!manager.fileExists(`${localPath}${playerClass}.png`)) {
      const classIcon = await getClassImage(playerClass);
      manager.writeImage(`${localPath}${playerClass}.png`, classIcon);
    }

    const classIconToAdd: Image = manager.readImage(
      `${localPath}${playerClass}.png`
    );
    playerClassIcons[playerClass] = classIconToAdd;
  }
  return playerClassIcons;
}

/**
 * HSReplay split the decks into class objects. This combines them into 1 array
 * @param allDecks : []
 * @returns : []
 */
async function combineAllDecks(
  allDecks: HsReplayDeckData
): Promise<CombinedDeckData[]> {
  const allPlayerClasses = Object.keys(allDecks.series.metadata);

  const reducer = (
    accumulator: Array<any>,
    allClassDecks: string
  ): Array<CombinedDeckData> => {
    return [
      ...accumulator,
      ...Object.values(allDecks.series.data[allClassDecks]),
    ];
  };

  return allPlayerClasses.reduce(reducer, []);
}

/**
 * Combines the decks array and the archetypes array
 * @param allDecks : []
 * @param allArchetypes : []
 * @returns : []
 */
async function addArchetypesToDecks(
  allDecks: CombinedDeckData[],
  allArchetypes: Archetypes[]
) {
  return allDecks
    .map((deck: CombinedDeckData) => {
      return {
        ...deck,
        archetype: allArchetypes.find(
          (archetype) => archetype.id === deck.archetype_id
        ),
      };
    })
    .filter((deck) => deck.archetype);
}

/**
 * Sorts deck array by win rate (descending)
 * @param allDecks : []
 * @returns : []
 */
async function sortDecksByWinRate(allDecks: CombinedDeckData[]) {
  return allDecks.sort(
    (a: CombinedDeckData, b: CombinedDeckData) =>
      (b.win_rate as number) - (a.win_rate as number)
  );
}

async function getJSON(url: string) {
  const req: Request = new Request(url);
  const res = await req.loadJSON();
  return res;
}

async function getImage(url: string) {
  const req = new Request(url);
  const res = await req.loadImage();
  return res;
}

async function getClassImage(playerClass: string) {
  const req = new Request(theme.classImageUrl(playerClass));
  const res = await req.loadImage();
  return res;
}

/**
 * Returns a number to limit decks shown within widgets
 * @returns : number
 */
function widgetDeckLimit(): number {
  if (config.widgetFamily === "medium") return 3;
  if (config.widgetFamily === "large") return 6;
  return allDecks.length;
}

/**
 * Returns what tier the deck is from the win rate
 * @param winRate : number
 * @returns : string
 */
function tierFromWinRate(winRate: number | string) {
  for (const [key, value] of Object.entries(settings.tierFloors)) {
    if (parseInt(winRate as string) > value) return key.toString();
  }
  return "T4";
}

async function sortDecksIntoTiers(decks: CombinedDeckData[]) {
  let tiers: Tiers = {};

  for (const deck of decks) {
    for (const [tier, tierFloor] of Object.entries(settings.tierFloors)) {
      if (parseInt(deck.win_rate as string) > tierFloor) {
        if (typeof tiers[tier] == "undefined") tiers[tier] = [];
        tiers[tier].push(deck);
        break;
      }
    }
  }
  return tiers;
}

function winRateColour(winRate: number | string) {
  if (parseInt(winRate as string) > 50) return theme.colours.green;
  if (parseInt(winRate as string) > 40) return theme.colours.orange;
  return theme.colours.red;
}

async function createWidget() {
  const widget = new ListWidget();

  // 	if small widget just display image
  if (config.widgetFamily === "small") {
    const HSReplayLogo = await getImage(
      "https://static.hsreplay.net/static/images/logo.58ae9cde1d07.png"
    );
    const smallWidgetImage = widget.addImage(HSReplayLogo);
    smallWidgetImage.centerAlignImage();
    smallWidgetImage.imageSize = new Size(50, 50);
    widget.backgroundColor = theme.colours.blue;
    Script.setWidget(widget);
    return;
  }

  // 	loop through decks. widgetDeckLimit() limits rhe amount to deck for widgets
  for await (const [deck, index] of allDecks
    .slice(0, widgetDeckLimit())
    .map((deck, index): [CombinedDeckData, number] => [deck, index])) {
    // 	deck row
    const widgetRow = widget.addStack();
    widgetRow.spacing = 10;
    widgetRow.centerAlignContent();

    // 	class image column
    const classImage = widgetRow.addStack();
    classImage.size = new Size(40, 40);
    classImage.cornerRadius = 20;
    classImage.backgroundColor = Color.lightGray();
    classImage.backgroundImage = await getClassImage(
      deck.archetype.player_class_name
    );

    // 	deck stats column
    const deckStats = widgetRow.addStack();
    deckStats.size = new Size(250, 50);
    deckStats.layoutVertically();

    const deckName = deckStats.addText(deck.archetype.name);
    const deckRate = deckStats.addText(
      `${deck.win_rate}% ${tierFromWinRate(deck.win_rate)}`
    );
    deckName.font = theme.font.widget.deckName;
    deckRate.font = theme.font.widget.deckWinRate;
    deckRate.textColor = winRateColour(deck.win_rate);

    // 	no bottom border on last deck/stack
    if (index !== widgetDeckLimit() - 1) {
      const line = widget.addStack();
      line.backgroundColor = Color.dynamic(
        theme.colours.grey,
        theme.colours.white
      );
      line.size = new Size(300, 1);
    }
  }

  Script.setWidget(widget);
}

function viewDeck(rowNumber: number) {
  rowNumber = rowNumber - 1;
  Safari.open(`https://hsreplay.net${allDecks[rowNumber].archetype.url}`);
}

async function createTable() {
  const table = new UITable();
  table.showSeparators = true;

  const deckTiers = await sortDecksIntoTiers(allDecks);

  for await (const [tier, decks] of Object.entries(deckTiers)) {
    const tierHeader = new UITableRow();
    tierHeader.isHeader = true;
    tierHeader.backgroundColor = theme.colours.blue;
    tierHeader.addText(tier.replace("T", "Tier "));
    table.addRow(tierHeader);

    for await (const deck of decks) {
      const row = new UITableRow();
      row.height = 80;
      row.cellSpacing = 0;

      const classImage = await getClassImage(deck.archetype.player_class_name);
      const classImage = Image.fromData(theme.playerClassImage);
      const classImageCell = row.addImage(classImage);
      classImageCell.widthWeight = 20;

      const textCell = row.addText(deck.archetype.name, `${deck.win_rate}%`);
      textCell.widthWeight = 80;
      textCell.titleFont = theme.font.table.deckName;
      textCell.subtitleFont = theme.font.table.deckWinRate;
      textCell.subtitleColor = winRateColour(deck.win_rate);

      // 			row.onSelect = (number) => viewDeck(number);

      row.onSelect = (number) => console.log(deck.archetype.name);

      table.addRow(row);
    }
  }
  QuickLook.present(table, true);
}

// Get raw data
const archetypes: Archetypes[] = await getJSON(
  "https://hsreplay.net/api/v1/archetypes/?format=json"
);
const allDecksData: HsReplayDeckData[] = await getJSON(
  "https://hsreplay.net/analytics/query/archetype_popularity_distribution_stats_v2/?GameType=RANKED_STANDARD&LeagueRankRange=BRONZE_THROUGH_GOLD&Region=ALL&TimeRange=CURRENT_EXPANSION"
);

// Save classes icons if not already dkne so
const classIcons = await storeAndRetrieveClassIcons(
  Object.keys(allDecksData.metadata)
);

// Assemble data
const combinedDecks: CombinedDeckData[] = await combineAllDecks(allDecksData);
const combinedDecksWithArchetypes = await addArchetypesToDecks(
  combinedDecks,
  archetypes
);
const allDecks = await sortDecksByWinRate(combinedDecksWithArchetypes);

if (config.runsInWidget) {
  await createWidget();
} else if (config.runsInApp) {
  await createTable();
}

Script.complete();
