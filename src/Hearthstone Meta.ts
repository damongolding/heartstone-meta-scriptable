// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: haykal;
const settings: Settings = {
  assetsBaseUrl: "https://damongolding.github.io/heartstone-meta-scriptable",
  tierFloors: {
    T1: 55,
    T2: 50,
    T3: 45,
    T4: 0,
  },
};

/**
 * skin can either be "classic" or "mono"
 */
const theme = {
  skin: "mono",
  classImageUrl: (playerClass: string) =>
    `${settings.assetsBaseUrl}/images/${playerClass.toLowerCase()}-${
      theme.skin
    }.png`,
  colours: {
    white: new Color("#fff", 0.1),
    grey: new Color("#eee", 1),
    darkGrey: new Color("#333", 1),
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
    up: `${settings.assetsBaseUrl}/images/up.png`,
    down: `${settings.assetsBaseUrl}/images/down.png`,
  },
};

// Get data
const archetypes: Archetype[] = await getJSON(
  "https://hsreplay.net/api/v1/archetypes/?format=json"
);

const dataUrls = [
  "https://hsreplay.net/analytics/query/archetype_popularity_distribution_stats_v2/?GameType=RANKED_STANDARD&LeagueRankRange=BRONZE_THROUGH_GOLD&Region=ALL&TimeRange=CURRENT_PATCH",
  "https://hsreplay.net/analytics/query/archetype_popularity_distribution_stats_v2/?GameType=RANKED_STANDARD&LeagueRankRange=BRONZE_THROUGH_GOLD&Region=ALL&TimeRange=CURRENT_EXPANSION",
  "https://hsreplay.net/analytics/query/archetype_popularity_distribution_stats_v2/?GameType=RANKED_STANDARD&LeagueRankRange=BRONZE_THROUGH_GOLD&Region=ALL&TimeRange=LAST_7_DAYS",
];

const getJsonTasks = dataUrls.map((url) => getJSON(url));

const allDecksDataRequest = await Promise.allSettled(getJsonTasks);

const allDecksData: any =
  allDecksDataRequest[0] != null
    ? allDecksDataRequest[0]
    : allDecksDataRequest[1] != null
    ? allDecksDataRequest[1]
    : allDecksDataRequest[2];

// const allDecksData: HsReplayDeckData = await getJSON(
//   "https://hsreplay.net/analytics/query/archetype_popularity_distribution_stats_v2/?GameType=RANKED_STANDARD&LeagueRankRange=BRONZE_THROUGH_GOLD&Region=ALL&TimeRange=LAST_7_DAYS"
// );

// If we fail to get data, alert user
if (!archetypes || !allDecksData) {
  const alertUser = new Alert();
  alertUser.title = "😱";
  alertUser.message = "Failed to fetch data";
  alertUser.present();
  // @ts-expect-error
  return Script.complete();
}

const classIcons: PlayerClassIcons = await storeAndRetrieveClassIcons(
  Object.keys(allDecksData.series.metadata)
);

// Meta check
await storeAndRetrievePastMeta(allDecksData);
await checkIfMetaHasShifted(allDecksData);

// Format HSreplay data
const combinedDecks: CombinedDeckData[] = await combineAllDecks(allDecksData);
const combinedDecksWithArchetypes: CombinedDeckData[] =
  await addArchetypesToDecks(combinedDecks, archetypes);
const allDecks = await sortDecksByWinRate(combinedDecksWithArchetypes);

// Format past HSreplay data
const allPastMetaDecksData = await storeAndRetrievePastMeta(
  allDecksData,
  "pastmeta"
);
const combinedPastMetaDecks: CombinedDeckData[] = await combineAllDecks(
  allPastMetaDecksData as HsReplayDeckData
);
const combinedPastMetaDecksWithArchetypes: CombinedDeckData[] =
  await addArchetypesToDecks(combinedPastMetaDecks, archetypes);
const allPastMetaDecks = await sortDecksByWinRate(
  combinedPastMetaDecksWithArchetypes
);

if (config.runsInWidget) {
  await createWidget(allDecks, allPastMetaDecks);
} else if (config.runsInApp) {
  await createTable(allDecks, allPastMetaDecks);
} else if (config.runsWithSiri) {
  await createTable(allDecks, allPastMetaDecks);
  Speech.speak(announceTopDeck(allDecks));
}

Script.complete();

/**
 * Formats a string for Siri to speak out
 * @param allDecks
 * @returns string
 */
function announceTopDeck(allDecks: CombinedDeckData[]): string {
  const currentTopDeck = allDecks[0];
  return `Currently the best performing deck is ${currentTopDeck.archetype?.name} with a win rate of ${currentTopDeck.win_rate}%`;
}

// Getter functions
async function getJSON(url: string): Promise<any> {
  try {
    const req: Request = new Request(url);
    const res = await req.loadJSON();
    return res;
  } catch {
    return null;
  }
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

/**
 * Checks to see if our saved files of out of date = the meta has changed
 * @param allDecksData
 * @returns
 */
async function checkIfMetaHasShifted(
  allDecksData: HsReplayDeckData
): Promise<boolean> {
  const currentSavedMeta = await storeAndRetrievePastMeta(
    allDecksData,
    "currentmeta"
  );
  if ((currentSavedMeta as HsReplayDeckData).as_of !== allDecksData.as_of) {
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
): Promise<HsReplayDeckData | void> {
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

  if (!fileToRetrieve) return;
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

    if (!manager.fileExists(`${localPath}/${playerClass}-${theme.skin}.png`)) {
      const classIcon = await getClassImage(playerClass);
      manager.writeImage(
        `${localPath}/${playerClass}-${theme.skin}.png`,
        classIcon
      );
    }

    const classIconToAdd: Image = manager.readImage(
      `${localPath}/${playerClass}-${theme.skin}.png`
    );
    playerClassIcons[playerClass] = classIconToAdd;
  }
  return playerClassIcons;
}

/**
 * HSReplay split the decks into class objects. This combines them into 1 array
 * @param allDecks : []
 * @returns : [CombinedDeckData]
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
 * @returns : [CombinedDeckData]
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
 * @returns : [CombinedDeckData]
 */
async function sortDecksByWinRate(
  allDecks: CombinedDeckData[]
): Promise<CombinedDeckData[]> {
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
function tierFromWinRate(winRate: number | string): string {
  for (const [key, value] of Object.entries(settings.tierFloors)) {
    if (parseInt(winRate as string) > value) return key.toString();
  }
  return "T4";
}

/**
 * Sort decks into tier objects for loop through on table view
 * @param decks
 * @returns [DecksInTiers]
 */
async function sortDecksIntoTiers(
  decks: CombinedDeckData[]
): Promise<DecksInTiers> {
  let tiers: DecksInTiers = {};

  for (const deck of decks) {
    for (const [tier, tierFloor] of Object.entries(settings.tierFloors)) {
      if (parseInt(deck.win_rate as string) >= tierFloor) {
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
 * @returns [FlattenedTiers]
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
 * @returns Colour
 */
function winRateColour(winRate: number | string): Color {
  if (parseInt(winRate as string) > 50) return theme.colours.green;
  if (parseInt(winRate as string) > 40) return theme.colours.orange;
  return theme.colours.red;
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

/**
 * Check if deck has moved in the meta, return data if so
 * @param allDecks
 * @param allPastMetaDecks
 * @param archetypeID
 * @returns {isNewDeck: boolean, deckAtSamePosition:boolean, arrowIcon: string | null, deckPositionShifted: number | null, directionColour: Color}
 */
async function hasDeckShiftedPosition(
  allDecks: CombinedDeckData[],
  allPastMetaDecks: CombinedDeckData[],
  archetypeID: number
) {
  const deckTiers = await sortDecksIntoTiers(allDecks);
  const pastDeckTiers = await sortDecksIntoTiers(allPastMetaDecks);

  const flattenedDecks = await flattenTiers(deckTiers);
  const flattenedPastDecks = await flattenTiers(pastDeckTiers);

  const currentTierPosition = flattenedDecks.findIndex(
    (savedDeck) => (savedDeck as CombinedDeckData).archetype_id === archetypeID
  );
  const pastTierPosition = flattenedPastDecks.findIndex(
    (savedDeck) => (savedDeck as CombinedDeckData).archetype_id === archetypeID
  );

  let arrowIcon: string | null = null;
  let deckPositionShifted: number | null = null;

  if (currentTierPosition !== pastTierPosition) {
    arrowIcon =
      pastTierPosition > currentTierPosition
        ? theme.arrowIcons.up
        : theme.arrowIcons.down;
    deckPositionShifted = Math.abs(pastTierPosition - currentTierPosition);
  }

  return {
    isNewDeck: pastTierPosition < 0 ? true : false,
    deckAtSamePosition: currentTierPosition === pastTierPosition ? true : false,
    arrowIcon: arrowIcon,
    deckPositionShifted: deckPositionShifted,
    directionColour:
      pastTierPosition > currentTierPosition
        ? theme.colours.green
        : theme.colours.red,
  };
}

/**
 * Build widget
 * @returns void
 */
async function createWidget(
  allDecks: CombinedDeckData[],
  allPastMetaDecks: CombinedDeckData[]
) {
  const widget = new ListWidget();
  const skinBackgroundColour: SkinBackgroundColour = {
    classic: theme.colours.blue,
    mono: theme.colours.darkGrey,
  };
  widget.backgroundColor = skinBackgroundColour[theme.skin];

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
    // Check to see if deck has moved position
    const { isNewDeck, deckAtSamePosition, arrowIcon } =
      await hasDeckShiftedPosition(
        allDecks,
        allPastMetaDecks,
        deck.archetype_id
      );

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
    deckStats.size = new Size(210, 50);
    deckStats.layoutVertically();

    const deckName = deckStats.addText(deck.archetype!.name);
    const deckRate = deckStats.addText(
      `${deck.win_rate}% ${tierFromWinRate(deck.win_rate)}`
    );

    deckName.font = theme.font.widget.deckName;
    deckName.textColor = Color.white();
    deckRate.font = theme.font.widget.deckWinRate;
    deckRate.textColor = winRateColour(deck.win_rate);

    // Deck position shift and NOT a new deck (wasn't there last time)
    if (!deckAtSamePosition && !isNewDeck) {
      const deckPosition = widgetRow.addStack();
      deckPosition.size = new Size(20, 20);
      const getIcon = await getImage(arrowIcon as string);
      deckPosition.addImage(getIcon);
    }

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
 * Create table view for in app
 * @param allDecks
 * @param allPastMetaDecks
 */
async function createTable(
  allDecks: CombinedDeckData[],
  allPastMetaDecks: CombinedDeckData[]
) {
  const table = new UITable();
  table.showSeparators = true;

  const deckTiers = await sortDecksIntoTiers(allDecks);

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
      // Check to see if deck has moved position
      const {
        isNewDeck,
        deckAtSamePosition,
        arrowIcon,
        deckPositionShifted,
        directionColour,
      } = await hasDeckShiftedPosition(
        allDecks,
        allPastMetaDecks,
        deck.archetype_id
      );

      const row = new UITableRow();
      row.height = 80;
      row.cellSpacing = 0;
      row.backgroundColor = Color.white();

      const classImage =
        classIcons[deck.archetype!.player_class_name.toLowerCase()];
      const classImageCell = row.addImage(classImage);
      classImageCell.widthWeight = 60;

      const textCell = row.addText(
        `   ${deck.archetype!.name}`,
        `  ${deck.win_rate}%`
      );
      // determine size of deckdata cell width
      textCell.widthWeight =
        Device.screenSize().width - (deckAtSamePosition ? 60 : 105);
      textCell.titleFont = theme.font.table.deckName;
      textCell.titleColor = Color.black();
      textCell.subtitleFont = theme.font.table.deckWinRate;
      textCell.subtitleColor = winRateColour(deck.win_rate);

      // Deck has moved position so show arrow
      if (!deckAtSamePosition && !isNewDeck) {
        const arrowCell = row.addImageAtURL(arrowIcon as string);
        arrowCell.widthWeight = 25;
        const deckPositionShift = row.addText(
          (deckPositionShifted as number).toString()
        );
        deckPositionShift.widthWeight = 20;
        const deckPositionShiftFontSize: number =
          (deckPositionShifted as number) > 9 ? 14 : 25;
        deckPositionShift.titleFont = Font.boldSystemFont(
          deckPositionShiftFontSize
        );
        deckPositionShift.titleColor = directionColour;
      }

      row.dismissOnSelect = false;
      row.onSelect = (number) => viewDeckOnHsReplay(number);

      table.addRow(row);
    }
  }
  QuickLook.present(table, true);
}

export {};
