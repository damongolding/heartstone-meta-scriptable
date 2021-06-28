const settings = {
    tierFloors: {
        T1: 55,
        T2: 50,
        T3: 45,
        T4: 0,
    },
};
const theme = {
    classImageUrl: (playerClass) => `https://static.hsreplay.net/static/images/64x/class-icons/${playerClass.toLowerCase()}.png`,
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
const archetypes = await getJSON("https://hsreplay.net/api/v1/archetypes/?format=json");
const allDecksData = await getJSON("https://hsreplay.net/analytics/query/archetype_popularity_distribution_stats_v2/?GameType=RANKED_STANDARD&LeagueRankRange=BRONZE_THROUGH_GOLD&Region=ALL&TimeRange=CURRENT_EXPANSION");
const classIcons = await storeAndRetrieveClassIcons(Object.keys(allDecksData.series.metadata));
if (!archetypes || !allDecksData) {
    const alertUser = new Alert();
    alertUser.title = "😱";
    alertUser.message = "Failed to fetch data";
    alertUser.present();
    return Script.complete();
}
const combinedDecks = await combineAllDecks(allDecksData);
const combinedDecksWithArchetypes = await addArchetypesToDecks(combinedDecks, archetypes);
const allDecks = await sortDecksByWinRate(combinedDecksWithArchetypes);
const allPastMetaDecksData = await storeAndRetrievePastMeta(allDecksData, "pastmeta");
const combinedPastMetaDecks = await combineAllDecks(allPastMetaDecksData);
const combinedPastMetaDecksWithArchetypes = await addArchetypesToDecks(combinedPastMetaDecks, archetypes);
const allPastMetaDecks = await sortDecksByWinRate(combinedPastMetaDecksWithArchetypes);
if (config.runsInWidget) {
    await createWidget();
}
else if (config.runsInApp) {
    await createTable(allDecks, allPastMetaDecks);
}
else if (config.runsWithSiri) {
    await createTable();
}
Script.complete();
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
async function storeAndRetrievePastMeta(allDecksData, fileToRetrieve) {
    const manager = FileManager.local();
    const localPath = manager.documentsDirectory();
    for (const file of ["pastmeta", "currentmeta"]) {
        if (!manager.fileExists(`${localPath}/${file}.json`)) {
            manager.writeString(`${localPath}/${file}.json`, JSON.stringify(allDecksData).toString());
        }
    }
    return JSON.parse(manager.readString(`${localPath}/${fileToRetrieve}.json`));
}
async function storeAndRetrieveClassIcons(playerClasses) {
    const manager = FileManager.local();
    const localPath = manager.documentsDirectory();
    let playerClassIcons = {};
    for await (let playerClass of playerClasses) {
        playerClass = playerClass.toLowerCase();
        if (!manager.fileExists(`${localPath}/${playerClass}.png`)) {
            const classIcon = await getClassImage(playerClass);
            manager.writeImage(`${localPath}/${playerClass}.png`, classIcon);
        }
        const classIconToAdd = manager.readImage(`${localPath}/${playerClass}.png`);
        playerClassIcons[playerClass] = classIconToAdd;
    }
    return playerClassIcons;
}
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
async function sortDecksByWinRate(allDecks) {
    return allDecks.sort((a, b) => b.win_rate - a.win_rate);
}
function widgetDeckLimit() {
    if (config.widgetFamily === "medium")
        return 3;
    if (config.widgetFamily === "large")
        return 6;
    return allDecks.length;
}
function tierFromWinRate(winRate) {
    for (const [key, value] of Object.entries(settings.tierFloors)) {
        if (parseInt(winRate) > value)
            return key.toString();
    }
    return "T4";
}
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
function winRateColour(winRate) {
    if (parseInt(winRate) > 50)
        return theme.colours.green;
    if (parseInt(winRate) > 40)
        return theme.colours.orange;
    return theme.colours.red;
}
async function createWidget() {
    const widget = new ListWidget();
    widget.backgroundColor = theme.colours.blue;
    if (config.widgetFamily === "small") {
        const HSReplayLogo = await getImage("https://static.hsreplay.net/static/images/logo.58ae9cde1d07.png");
        const smallWidgetImage = widget.addImage(HSReplayLogo);
        smallWidgetImage.centerAlignImage();
        smallWidgetImage.imageSize = new Size(100, 100);
        Script.setWidget(widget);
        return;
    }
    for await (const [deck, index] of allDecks
        .slice(0, widgetDeckLimit())
        .map((deck, index) => [deck, index])) {
        const widgetRow = widget.addStack();
        widgetRow.spacing = 10;
        widgetRow.centerAlignContent();
        const classImage = widgetRow.addStack();
        classImage.size = new Size(40, 40);
        classImage.backgroundImage = await getClassImage(deck.archetype.player_class_name);
        const deckStats = widgetRow.addStack();
        deckStats.size = new Size(250, 50);
        deckStats.layoutVertically();
        const deckName = deckStats.addText(deck.archetype.name);
        const deckRate = deckStats.addText(`${deck.win_rate}% ${tierFromWinRate(deck.win_rate)}`);
        deckName.font = theme.font.widget.deckName;
        deckName.textColor = Color.white();
        deckRate.font = theme.font.widget.deckWinRate;
        deckRate.textColor = winRateColour(deck.win_rate);
        if (index !== widgetDeckLimit() - 1) {
            const line = widget.addStack();
            line.backgroundColor = theme.colours.white;
            line.size = new Size(300, 1);
        }
    }
    Script.setWidget(widget);
}
async function viewDeckOnHsReplay(rowNumber) {
    const deckTiers = await sortDecksIntoTiers(allDecks);
    const FlattenedTiers = await flattenTiers(deckTiers, true);
    Safari.open(`https://hsreplay.net${FlattenedTiers[rowNumber].archetype.url}`);
}
async function createTable(allDecks, allPastMetaDecks) {
    const table = new UITable();
    table.showSeparators = true;
    const deckTiers = await sortDecksIntoTiers(allDecks);
    const pastDeckTiers = await sortDecksIntoTiers(allPastMetaDecks);
    const flattenedDecks = await flattenTiers(deckTiers);
    const flattenedPastDecks = await flattenTiers(pastDeckTiers);
    for await (const [tier, decks] of Object.entries(deckTiers)) {
        const tierHeader = new UITableRow();
        tierHeader.isHeader = true;
        tierHeader.backgroundColor = theme.colours.blue;
        const tierHeaderText = tierHeader.addText(tier.replace("T", "Tier "));
        tierHeaderText.titleColor = Color.white();
        tierHeaderText.subtitleColor = Color.white();
        table.addRow(tierHeader);
        for await (const deck of decks) {
            let currentTierPosition = flattenedDecks.findIndex((savedDeck) => savedDeck.archetype_id ===
                deck.archetype_id);
            let pastTierPosition = flattenedPastDecks.findIndex((savedDeck) => savedDeck.archetype_id ===
                deck.archetype_id);
            currentTierPosition = Math.floor(Math.random() * 9 + 1);
            pastTierPosition = Math.floor(Math.random() * 9 + 1);
            pastTierPosition = pastTierPosition + 5;
            let arrowIcon = null;
            let deckPositionShifted = null;
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
            const classImage = classIcons[deck.archetype.player_class_name.toLowerCase()];
            const classImageCell = row.addImage(classImage);
            classImageCell.widthWeight = 60;
            const textCell = row.addText(deck.archetype.name, `${deck.win_rate}%`);
            textCell.widthWeight = Device.screenSize().width - 120;
            textCell.titleFont = theme.font.table.deckName;
            textCell.titleColor = Color.black();
            textCell.subtitleFont = theme.font.table.deckWinRate;
            textCell.subtitleColor = winRateColour(deck.win_rate);
            const spaceCell = row.addText(" ");
            spaceCell.widthWeight = 5;
            if (arrowIcon && arrowIcon) {
                const arrowCell = row.addImageAtURL(arrowIcon);
                arrowCell.widthWeight = 25;
                const deckPositionShift = row.addText(deckPositionShifted.toString());
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
