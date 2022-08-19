import requests

ARCHETYPES_URL = "https://hsreplay.net/api/v1/archetypes/?format=json"

HS_REPLAY_DECK_DATA_URL = "https://hsreplay.net/analytics/query/archetype_popularity_distribution_stats_v2/?GameType=RANKED_STANDARD&LeagueRankRange=BRONZE_THROUGH_GOLD&Region=ALL&TimeRange=LAST_7_DAYS"

# def get_data():
# 	ARCHETYPES = requests.get(ARCHETYPES_URL).content
# 	HS_REPLAY_DECK_DATA = requests.get(HS_REPLAY_DECK_DATA_URL).content

# get_data()

ARCHETYPES = requests.get(ARCHETYPES_URL).content
HS_REPLAY_DECK_DATA = requests.get(HS_REPLAY_DECK_DATA_URL).content
print(HS_REPLAY_DECK_DATA)
