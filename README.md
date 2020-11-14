# Сбор статистики игроков VimeWorld
При достаточном количестве токенов может собрать информацию обо всех игроках (5+ миллионов) менее, чем за три минуты.

Используется для подсчёта интересной и не очень статистики, например:
```> db.vime.aggregate([{$group:{_id:'$rank', players:{$sum: 1}}}])
{ "_id" : "ORGANIZER", "players" : 5 }
{ "_id" : "PREMIUM", "players" : 636 }
{ "_id" : "HOLY", "players" : 28139 }
{ "_id" : "WARDEN", "players" : 2 }
{ "_id" : "BUILDER", "players" : 6 }
{ "_id" : "VIP", "players" : 775 }
{ "_id" : "MAPLEAD", "players" : 1 }
{ "_id" : "IMMORTAL", "players" : 6075 }
{ "_id" : "YOUTUBE", "players" : 70 }
{ "_id" : "MODER", "players" : 69 }
{ "_id" : "DEV", "players" : 4 }
{ "_id" : "CHIEF", "players" : 1 }
{ "_id" : "ADMIN", "players" : 2 }
{ "_id" : "PLAYER", "players" : 5944444 }
```
