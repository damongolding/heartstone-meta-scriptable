//  screenSize : 414,
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
      deckName: Font.boldSystemFont(14),
      deckWinRate: Font.boldSystemFont(18),
    },
    table: {
      deckName: Font.boldSystemFont(18),
      deckWinRate: Font.boldSystemFont(25),
    },
  },
  arrowIcons: {
    up: "https://img.icons8.com/ios-glyphs/90/22A117/up--v1.png",
    down: "https://img.icons8.com/ios-glyphs/90/FF5050/down--v1.png",
  },
};

// Get raw data
//@ts-expect-error
const archetypes: Archetype[] = await getJSON(
  "https://hsreplay.net/api/v1/archetypes/?format=json"
);
//@ts-expect-error
const allDecksData: HsReplayDeckData = await getJSON(
  "https://hsreplay.net/analytics/query/archetype_popularity_distribution_stats_v2/?GameType=RANKED_STANDARD&LeagueRankRange=BRONZE_THROUGH_GOLD&Region=ALL&TimeRange=CURRENT_EXPANSION"
);
//@ts-expect-error
const classIcons: PlayerClassIcons = await storeAndRetrieveClassIcons(
  Object.keys(allDecksData.series.metadata)
);

// If we fail to get data, alert user
if (!archetypes || !allDecksData) {
  const alertUser = new Alert();
  alertUser.title = "😱";
  alertUser.message = "Failed to fetch data";
  alertUser.present();
  //@ts-expect-error
  return Script.complete();
}

// Meta check
//@ts-expect-error
await storeAndRetrievePastMeta(allDecksData);
//@ts-expect-error
await checkIfMetaHasShifted(allDecksData);

// Assemble data
//@ts-expect-error
const combinedDecks: CombinedDeckData[] = await combineAllDecks(allDecksData);

const combinedDecksWithArchetypes: CombinedDeckData[] =
  //@ts-expect-error
  await addArchetypesToDecks(combinedDecks, archetypes);
//@ts-expect-error
const allDecks = await sortDecksByWinRate(combinedDecksWithArchetypes);

// PAST META DATA
//@ts-expect-error
const allPastMetaDecksData = await storeAndRetrievePastMeta(
  allDecksData,
  "pastmeta"
);
//@ts-expect-error
const combinedPastMetaDecks: CombinedDeckData[] = await combineAllDecks(
  allPastMetaDecksData
);
const combinedPastMetaDecksWithArchetypes: CombinedDeckData[] =
  //@ts-expect-error
  await addArchetypesToDecks(combinedPastMetaDecks, archetypes);
//@ts-expect-error
const allPastMetaDecks = await sortDecksByWinRate(
  combinedPastMetaDecksWithArchetypes
);

if (config.runsInWidget) {
  //@ts-expect-error
  await createWidget();
} else if (config.runsInApp) {
  //@ts-expect-error
  await createTable(allDecks, allPastMetaDecks);
} else if (config.runsWithSiri) {
  //@ts-expect-error
  await createTable();
}

Script.complete();

// Getter functions
async function getJSON(url: string): Promise<Object> {
  const req: Request = new Request(url);
  const res = await req.loadJSON();
  return res;
}

async function getImage(url: string): Promise<Image> {
  const req = new Request(url);
  const res = await req.loadImage();
  return res;
}

async function getClassImage(playerClass: string): Promise<Image> {
  const req = new Request(theme.classImageUrl(playerClass));
  const res = await req.loadImage();
  return res;
}

async function checkIfMetaHasShifted(
  allDecksData: HsReplayDeckData
): Promise<boolean> {
  const currentSavedMeta = await storeAndRetrievePastMeta(
    allDecksData,
    "currentmeta"
  );
  if (currentSavedMeta.as_of !== allDecksData.as_of) {
    const manager = FileManager.local();
    const localPath = manager.documentsDirectory();

    // Move current meta to pastMeta
    manager.writeString(
      `${localPath}/pastmeta.json`,
      JSON.stringify(currentSavedMeta).toString()
    );

    manager.writeString(
      `${localPath}/currentmeta.json`,
      JSON.stringify(allDecksData).toString()
    );

    return true;
  }
  return false;
}

/**
 * Retrieve stored meta (save them if we don't have a saved version)
 * @param allDecksData
 * @param fileToRetrieve
 * @returns HsReplayDeckData
 */
async function storeAndRetrievePastMeta(
  allDecksData: HsReplayDeckData,
  fileToRetrieve?: "pastmeta" | "currentmeta"
): Promise<HsReplayDeckData> {
  const manager = FileManager.local();
  const localPath = manager.documentsDirectory();

  for (const file of ["pastmeta", "currentmeta"]) {
    if (!manager.fileExists(`${localPath}/${file}.json`)) {
      manager.writeString(
        `${localPath}/${file}.json`,
        JSON.stringify(allDecksData).toString()
      );
    }
  }

  return JSON.parse(manager.readString(`${localPath}/${fileToRetrieve}.json`));
}

/**
 * See if class icons are saved locally, if not grab and save them then return the local version
 * @param playerClasses
 * @returns : [Images]
 */
async function storeAndRetrieveClassIcons(
  playerClasses: string[]
): Promise<PlayerClassIcons> {
  const manager = FileManager.local();
  const localPath = manager.documentsDirectory();
  let playerClassIcons: PlayerClassIcons = {};

  for await (let playerClass of playerClasses) {
    playerClass = playerClass.toLowerCase();

    if (!manager.fileExists(`${localPath}/${playerClass}.png`)) {
      const classIcon = await getClassImage(playerClass);
      manager.writeImage(`${localPath}/${playerClass}.png`, classIcon);
    }

    const classIconToAdd: Image = manager.readImage(
      `${localPath}/${playerClass}.png`
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
  allDecks: DeckData[],
  allArchetypes: Archetype[]
): Promise<CombinedDeckData[]> {
  return allDecks
    .map((deck: DeckData): CombinedDeckData => {
      const finder = (archetype: Archetype): Archetype | undefined => {
        if (archetype.id === deck.archetype_id) return archetype;
      };
      return {
        ...deck,
        archetype: allArchetypes.find(finder),
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

/**
 * Sort decks into tier objects for loop through on table view
 * @param decks
 * @returns object sorted into tiers
 */
async function sortDecksIntoTiers(decks: CombinedDeckData[]) {
  let tiers: DecksInTiers = {};

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

/**
 * Flatten tiers so index from the table (onSelect) is equal to the deck
 * @param array
 * @returns Flat array
 */
async function flattenTiers(
  array: DecksInTiers,
  includeTier: boolean = false
): Promise<FlattenedTiers> {
  let outArray: FlattenedTiers = [];

  for await (const tier of Object.keys(array)) {
    if (includeTier) outArray.push(tier);
    for (const deck of Object.values(array[tier])) {
      outArray.push(deck);
    }
  }

  return outArray;
}

/**
 * What colour should be used for win rate
 * @param winRate
 * @returns Colour for text
 */
function winRateColour(winRate: number | string) {
  if (parseInt(winRate as string) > 50) return theme.colours.green;
  if (parseInt(winRate as string) > 40) return theme.colours.orange;
  return theme.colours.red;
}

async function createWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = theme.colours.blue;

  // 	if small widget just display image
  if (config.widgetFamily === "small") {
    const HSReplayLogo = await getImage(
      "https://static.hsreplay.net/static/images/logo.58ae9cde1d07.png"
    );
    const smallWidgetImage = widget.addImage(HSReplayLogo);
    smallWidgetImage.centerAlignImage();
    smallWidgetImage.imageSize = new Size(100, 100);
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
    classImage.backgroundImage = await getClassImage(
      deck.archetype!.player_class_name
    );

    // 	deck stats column
    const deckStats = widgetRow.addStack();
    deckStats.size = new Size(250, 50);
    deckStats.layoutVertically();

    const deckName = deckStats.addText(deck.archetype!.name);
    const deckRate = deckStats.addText(
      `${deck.win_rate}% ${tierFromWinRate(deck.win_rate)}`
    );
    deckName.font = theme.font.widget.deckName;
    deckName.textColor = Color.white();
    deckRate.font = theme.font.widget.deckWinRate;
    deckRate.textColor = winRateColour(deck.win_rate);

    // 	no bottom border on last deck/stack
    if (index !== widgetDeckLimit() - 1) {
      const line = widget.addStack();
      line.backgroundColor = theme.colours.white;
      line.size = new Size(300, 1);
    }
  }

  Script.setWidget(widget);
}

/**
 * Open deck in a browser window
 * @param rowNumber the index of the selected/tapped row
 */
async function viewDeckOnHsReplay(rowNumber: number) {
  const deckTiers = await sortDecksIntoTiers(allDecks);
  const FlattenedTiers = await flattenTiers(deckTiers, true);
  Safari.open(
    `https://hsreplay.net${
      (FlattenedTiers[rowNumber] as CombinedDeckData).archetype!.url
    }`
  );
}

async function createTable(
  allDecks: CombinedDeckData[],
  allPastMetaDecks: CombinedDeckData[]
) {
  const table = new UITable();
  table.showSeparators = true;

  const deckTiers = await sortDecksIntoTiers(allDecks);
  const pastDeckTiers = await sortDecksIntoTiers(allPastMetaDecks);

  const flattenedDecks = await flattenTiers(deckTiers);
  const flattenedPastDecks = await flattenTiers(pastDeckTiers);

  for await (const [tier, decks] of Object.entries(deckTiers)) {
    // Create tier heading
    const tierHeader = new UITableRow();
    tierHeader.isHeader = true;
    tierHeader.backgroundColor = theme.colours.blue;
    const tierHeaderText = tierHeader.addText(tier.replace("T", "Tier "));
    tierHeaderText.titleColor = Color.white();
    tierHeaderText.subtitleColor = Color.white();
    table.addRow(tierHeader);

    // Now the decks inside current tier
    for await (const deck of decks) {
      let currentTierPosition = flattenedDecks.findIndex(
        (savedDeck) =>
          (savedDeck as CombinedDeckData).archetype_id ===
          (deck as CombinedDeckData).archetype_id
      );
      let pastTierPosition = flattenedPastDecks.findIndex(
        (savedDeck) =>
          (savedDeck as CombinedDeckData).archetype_id ===
          (deck as CombinedDeckData).archetype_id
      );

      currentTierPosition = Math.floor(Math.random() * 9 + 1);
      pastTierPosition = Math.floor(Math.random() * 9 + 1);

      pastTierPosition = pastTierPosition + 5;

      let arrowIcon: string | null = null;
      let deckPositionShifted: number | null = null;

      console.log(`Current Tier : ${currentTierPosition}`);
      console.log(`Past Tier : ${pastTierPosition}`);

      if (currentTierPosition !== pastTierPosition) {
        arrowIcon =
          pastTierPosition > currentTierPosition
            ? theme.arrowIcons.up
            : theme.arrowIcons.down;
        deckPositionShifted = Math.abs(pastTierPosition - currentTierPosition);
      }

      const row = new UITableRow();
      row.height = 80;
      row.cellSpacing = 0;
      row.backgroundColor = Color.white();

      const classImage =
        classIcons[deck.archetype!.player_class_name.toLowerCase()];
      const classImageCell = row.addImage(classImage);
      classImageCell.widthWeight = 60;

      const textCell = row.addText(deck.archetype!.name, `${deck.win_rate}%`);
      textCell.widthWeight = Device.screenSize().width - 120;
      textCell.titleFont = theme.font.table.deckName;
      textCell.titleColor = Color.black();
      textCell.subtitleFont = theme.font.table.deckWinRate;
      textCell.subtitleColor = winRateColour(deck.win_rate);

      const spaceCell = row.addText(" ");
      spaceCell.widthWeight = 5;

      if (arrowIcon && arrowIcon) {
        const arrowCell = row.addImageAtURL(arrowIcon as string);
        arrowCell.widthWeight = 25;
        const deckPositionShift = row.addText(
          (deckPositionShifted as number).toString()
        );
        deckPositionShift.widthWeight = 20;
        deckPositionShift.titleFont = Font.boldSystemFont(25);
        deckPositionShift.titleColor =
          pastTierPosition > currentTierPosition
            ? theme.colours.green
            : theme.colours.red;
      }

      row.dismissOnSelect = false;
      row.onSelect = (number) => viewDeckOnHsReplay(number);

      table.addRow(row);
    }
  }
  QuickLook.present(table, true);
}
