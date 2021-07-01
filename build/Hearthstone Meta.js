// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: haykal;
const settings = {
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
    classImageUrl: (playerClass) => `${settings.assetsBaseUrl}/images/${playerClass.toLowerCase()}-${theme.skin}.png`,
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
const archetypes = await getJSON("https://hsreplay.net/api/v1/archetypes/?format=json");
const allDecksData = await getJSON("https://hsreplay.net/analytics/query/archetype_popularity_distribution_stats_v2/?GameType=RANKED_STANDARD&LeagueRankRange=BRONZE_THROUGH_GOLD&Region=ALL&TimeRange=CURRENT_EXPANSION");
const classIcons = await storeAndRetrieveClassIcons(Object.keys(allDecksData.series.metadata));
// If we fail to get data, alert user
if (!archetypes || !allDecksData) {
    const alertUser = new Alert();
    alertUser.title = "😱";
    alertUser.message = "Failed to fetch data";
    alertUser.present();
    // @ts-expect-error
    return Script.complete();
}
// Meta check
await storeAndRetrievePastMeta(allDecksData);
await checkIfMetaHasShifted(allDecksData);
// Format HSreplay data
const combinedDecks = await combineAllDecks(allDecksData);
const combinedDecksWithArchetypes = await addArchetypesToDecks(combinedDecks, archetypes);
const allDecks = await sortDecksByWinRate(combinedDecksWithArchetypes);
// Format past HSreplay data
const allPastMetaDecksData = await storeAndRetrievePastMeta(allDecksData, "pastmeta");
const combinedPastMetaDecks = await combineAllDecks(allPastMetaDecksData);
const combinedPastMetaDecksWithArchetypes = await addArchetypesToDecks(combinedPastMetaDecks, archetypes);
const allPastMetaDecks = await sortDecksByWinRate(combinedPastMetaDecksWithArchetypes);
if (config.runsInWidget) {
    await createWidget(allDecks, allPastMetaDecks);
}
else if (config.runsInApp) {
    await createTable(allDecks, allPastMetaDecks);
}
else if (config.runsWithSiri) {
    await createTable(allDecks, allPastMetaDecks);
    Speech.speak(announceTopDeck(allDecks));
}
Script.complete();
/**
 * Formats a string for Siri to speak out
 * @param allDecks
 * @returns string
 */
function announceTopDeck(allDecks) {
    const currentTopDeck = allDecks[0];
    return `Currently the best performing deck is ${currentTopDeck.archetype?.name} with a win rate of ${currentTopDeck.win_rate}%`;
}
// Getter functions
async function getJSON(url) {
    const req = new Request(url);
    const res = await req.loadJSON();
    return res;
}
async function getImage(url) {
    const req = new Request(url);
    const res = await req.loadImage();
    return res;
}
async function getClassImage(playerClass) {
    const req = new Request(theme.classImageUrl(playerClass));
    const res = await req.loadImage();
    return res;
}
/**
 * Checks to see if our saved files of out of date = the meta has changed
 * @param allDecksData
 * @returns
 */
async function checkIfMetaHasShifted(allDecksData) {
    const currentSavedMeta = await storeAndRetrievePastMeta(allDecksData, "currentmeta");
    if (currentSavedMeta.as_of !== allDecksData.as_of) {
        const manager = FileManager.local();
        const localPath = manager.documentsDirectory();
        // Move current meta to pastMeta
        manager.writeString(`${localPath}/pastmeta.json`, JSON.stringify(currentSavedMeta).toString());
        manager.writeString(`${localPath}/currentmeta.json`, JSON.stringify(allDecksData).toString());
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
async function storeAndRetrievePastMeta(allDecksData, fileToRetrieve) {
    const manager = FileManager.local();
    const localPath = manager.documentsDirectory();
    for (const file of ["pastmeta", "currentmeta"]) {
        if (!manager.fileExists(`${localPath}/${file}.json`)) {
            manager.writeString(`${localPath}/${file}.json`, JSON.stringify(allDecksData).toString());
        }
    }
    if (!fileToRetrieve)
        return;
    return JSON.parse(manager.readString(`${localPath}/${fileToRetrieve}.json`));
}
/**
 * See if class icons are saved locally, if not grab and save them then return the local version
 * @param playerClasses
 * @returns : [Images]
 */
async function storeAndRetrieveClassIcons(playerClasses) {
    const manager = FileManager.local();
    const localPath = manager.documentsDirectory();
    let playerClassIcons = {};
    for await (let playerClass of playerClasses) {
        playerClass = playerClass.toLowerCase();
        if (!manager.fileExists(`${localPath}/${playerClass}-${theme.skin}.png`)) {
            const classIcon = await getClassImage(playerClass);
            manager.writeImage(`${localPath}/${playerClass}-${theme.skin}.png`, classIcon);
        }
        const classIconToAdd = manager.readImage(`${localPath}/${playerClass}-${theme.skin}.png`);
        playerClassIcons[playerClass] = classIconToAdd;
    }
    return playerClassIcons;
}
/**
 * HSReplay split the decks into class objects. This combines them into 1 array
 * @param allDecks : []
 * @returns : [CombinedDeckData]
 */
async function combineAllDecks(allDecks) {
    const allPlayerClasses = Object.keys(allDecks.series.metadata);
    const reducer = (accumulator, allClassDecks) => {
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
async function addArchetypesToDecks(allDecks, allArchetypes) {
    return allDecks
        .map((deck) => {
        const finder = (archetype) => {
            if (archetype.id === deck.archetype_id)
                return archetype;
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
async function sortDecksByWinRate(allDecks) {
    return allDecks.sort((a, b) => b.win_rate - a.win_rate);
}
/**
 * Returns a number to limit decks shown within widgets
 * @returns : number
 */
function widgetDeckLimit() {
    if (config.widgetFamily === "medium")
        return 3;
    if (config.widgetFamily === "large")
        return 6;
    return allDecks.length;
}
/**
 * Returns what tier the deck is from the win rate
 * @param winRate : number
 * @returns : string
 */
function tierFromWinRate(winRate) {
    for (const [key, value] of Object.entries(settings.tierFloors)) {
        if (parseInt(winRate) > value)
            return key.toString();
    }
    return "T4";
}
/**
 * Sort decks into tier objects for loop through on table view
 * @param decks
 * @returns [DecksInTiers]
 */
async function sortDecksIntoTiers(decks) {
    let tiers = {};
    for (const deck of decks) {
        for (const [tier, tierFloor] of Object.entries(settings.tierFloors)) {
            if (parseInt(deck.win_rate) > tierFloor) {
                if (typeof tiers[tier] == "undefined")
                    tiers[tier] = [];
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
async function flattenTiers(array, includeTier = false) {
    let outArray = [];
    for await (const tier of Object.keys(array)) {
        if (includeTier)
            outArray.push(tier);
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
function winRateColour(winRate) {
    if (parseInt(winRate) > 50)
        return theme.colours.green;
    if (parseInt(winRate) > 40)
        return theme.colours.orange;
    return theme.colours.red;
}
/**
 * Open deck in a browser window
 * @param rowNumber the index of the selected/tapped row
 */
async function viewDeckOnHsReplay(rowNumber) {
    const deckTiers = await sortDecksIntoTiers(allDecks);
    const FlattenedTiers = await flattenTiers(deckTiers, true);
    Safari.open(`https://hsreplay.net${FlattenedTiers[rowNumber].archetype.url}`);
}
/**
 * Check if deck has moved in the meta, return data if so
 * @param allDecks
 * @param allPastMetaDecks
 * @param archetypeID
 * @returns {isNewDeck: boolean, deckAtSamePosition:boolean, arrowIcon: string | null, deckPositionShifted: number | null, directionColour: Color}
 */
async function hasDeckShiftedPosition(allDecks, allPastMetaDecks, archetypeID) {
    const deckTiers = await sortDecksIntoTiers(allDecks);
    const pastDeckTiers = await sortDecksIntoTiers(allPastMetaDecks);
    const flattenedDecks = await flattenTiers(deckTiers);
    const flattenedPastDecks = await flattenTiers(pastDeckTiers);
    const currentTierPosition = flattenedDecks.findIndex((savedDeck) => savedDeck.archetype_id === archetypeID);
    const pastTierPosition = flattenedPastDecks.findIndex((savedDeck) => savedDeck.archetype_id === archetypeID);
    let arrowIcon = null;
    let deckPositionShifted = null;
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
        directionColour: pastTierPosition > currentTierPosition
            ? theme.colours.green
            : theme.colours.red,
    };
}
/**
 * Build widget
 * @returns void
 */
async function createWidget(allDecks, allPastMetaDecks) {
    const widget = new ListWidget();
    const skinBackgroundColour = {
        classic: theme.colours.blue,
        colour: theme.colours.darkGrey,
    };
    widget.backgroundColor = skinBackgroundColour[theme.skin];
    // 	if small widget just display image
    if (config.widgetFamily === "small") {
        const HSReplayLogo = await getImage("https://static.hsreplay.net/static/images/logo.58ae9cde1d07.png");
        const smallWidgetImage = widget.addImage(HSReplayLogo);
        smallWidgetImage.centerAlignImage();
        smallWidgetImage.imageSize = new Size(100, 100);
        Script.setWidget(widget);
        return;
    }
    // 	loop through decks. widgetDeckLimit() limits rhe amount to deck for widgets
    for await (const [deck, index] of allDecks
        .slice(0, widgetDeckLimit())
        .map((deck, index) => [deck, index])) {
        // Check to see if deck has moved position
        const { isNewDeck, deckAtSamePosition, arrowIcon } = await hasDeckShiftedPosition(allDecks, allPastMetaDecks, deck.archetype_id);
        // 	deck row
        const widgetRow = widget.addStack();
        widgetRow.spacing = 10;
        widgetRow.centerAlignContent();
        // 	class image column
        const classImage = widgetRow.addStack();
        classImage.size = new Size(40, 40);
        classImage.backgroundImage = await getClassImage(deck.archetype.player_class_name);
        // 	deck stats column
        const deckStats = widgetRow.addStack();
        deckStats.size = new Size(210, 50);
        deckStats.layoutVertically();
        const deckName = deckStats.addText(deck.archetype.name);
        const deckRate = deckStats.addText(`${deck.win_rate}% ${tierFromWinRate(deck.win_rate)}`);
        deckName.font = theme.font.widget.deckName;
        deckName.textColor = Color.white();
        deckRate.font = theme.font.widget.deckWinRate;
        deckRate.textColor = winRateColour(deck.win_rate);
        // Deck position shift and NOT a new deck (wasn't there last time)
        if (!deckAtSamePosition && !isNewDeck) {
            const deckPosition = widgetRow.addStack();
            deckPosition.size = new Size(20, 20);
            const getIcon = await getImage(arrowIcon);
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
async function createTable(allDecks, allPastMetaDecks) {
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
            const { isNewDeck, deckAtSamePosition, arrowIcon, deckPositionShifted, directionColour, } = await hasDeckShiftedPosition(allDecks, allPastMetaDecks, deck.archetype_id);
            const row = new UITableRow();
            row.height = 80;
            row.cellSpacing = 0;
            row.backgroundColor = Color.white();
            const classImage = classIcons[deck.archetype.player_class_name.toLowerCase()];
            const classImageCell = row.addImage(classImage);
            classImageCell.widthWeight = 60;
            const textCell = row.addText(`   ${deck.archetype.name}`, `  ${deck.win_rate}%`);
            // determine size of deckdata cell width
            textCell.widthWeight =
                Device.screenSize().width - (deckAtSamePosition ? 60 : 105);
            textCell.titleFont = theme.font.table.deckName;
            textCell.titleColor = Color.black();
            textCell.subtitleFont = theme.font.table.deckWinRate;
            textCell.subtitleColor = winRateColour(deck.win_rate);
            // Deck has moved position so show arrow
            if (!deckAtSamePosition && !isNewDeck) {
                const arrowCell = row.addImageAtURL(arrowIcon);
                arrowCell.widthWeight = 25;
                const deckPositionShift = row.addText(deckPositionShifted.toString());
                deckPositionShift.widthWeight = 20;
                const deckPositionShiftFontSize = deckPositionShifted > 9 ? 14 : 25;
                deckPositionShift.titleFont = Font.boldSystemFont(deckPositionShiftFontSize);
                deckPositionShift.titleColor = directionColour;
            }
            row.dismissOnSelect = false;
            row.onSelect = (number) => viewDeckOnHsReplay(number);
            table.addRow(row);
        }
    }
    QuickLook.present(table, true);
}

