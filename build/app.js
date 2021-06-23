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
};
const archetypes = await getJSON("https://hsreplay.net/api/v1/archetypes/?format=json");
const allDecksData = await getJSON("https://hsreplay.net/analytics/query/archetype_popularity_distribution_stats_v2/?GameType=RANKED_STANDARD&LeagueRankRange=BRONZE_THROUGH_GOLD&Region=ALL&TimeRange=CURRENT_EXPANSION");
const classIcons = await storeAndRetrieveClassIcons(Object.keys(allDecksData.series.metadata));
const combinedDecks = await combineAllDecks(allDecksData);
const combinedDecksWithArchetypes = await addArchetypesToDecks(combinedDecks, archetypes);
const allDecks = await sortDecksByWinRate(combinedDecksWithArchetypes);
if (config.runsInWidget) {
    await createWidget();
}
else if (config.runsInApp) {
    await createTable();
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
async function flattenTiers(array) {
    let outArray = [];
    for await (const tier of Object.keys(array)) {
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
    const FlattenedTiers = await flattenTiers(deckTiers);
    Safari.open(`https://hsreplay.net${FlattenedTiers[rowNumber].archetype.url}`);
}
async function createTable() {
    const table = new UITable();
    table.showSeparators = true;
    const deckTiers = await sortDecksIntoTiers(allDecks);
    for await (const [tier, decks] of Object.entries(deckTiers)) {
        const tierHeader = new UITableRow();
        tierHeader.isHeader = true;
        tierHeader.backgroundColor = theme.colours.blue;
        const tierHeaderText = tierHeader.addText(tier.replace("T", "Tier "));
        tierHeaderText.titleColor = Color.white();
        tierHeaderText.subtitleColor = Color.white();
        table.addRow(tierHeader);
        for await (const deck of decks) {
            const row = new UITableRow();
            row.height = 80;
            row.cellSpacing = 0;
            row.backgroundColor = Color.white();
            const classImage = classIcons[deck.archetype.player_class_name.toLowerCase()];
            const classImageCell = row.addImage(classImage);
            classImageCell.widthWeight = 20;
            const textCell = row.addText(deck.archetype.name, `${deck.win_rate}%`);
            textCell.widthWeight = 80;
            textCell.titleFont = theme.font.table.deckName;
            textCell.titleColor = Color.black();
            textCell.subtitleFont = theme.font.table.deckWinRate;
            textCell.subtitleColor = winRateColour(deck.win_rate);
            row.dismissOnSelect = false;
            row.onSelect = (number) => viewDeckOnHsReplay(number);
            table.addRow(row);
        }
    }
    QuickLook.present(table, true);
}
