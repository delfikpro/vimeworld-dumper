const fs = require('fs');
const mongo = require('mongodb');
const axios = require('axios');

tokens = [];

process.env.VIMEWORLD_TOKENS.split(',').forEach(token => {
    tokens.push({
        token: token.replace(/[^A-Za-z0-9]/g, ''),
        requestsLeft: -1,
        resetTime: 0
    });
});

var url = process.env.MONGO_URL;
if (!url) {
    console.log("No MONGO_URL environment variable specified.")
    return;
}

var mongoClient = require('mongodb').MongoClient(url, { useUnifiedTopology: true, useNewUrlParser: true });


mongoClient.connect(onConnected);

function onConnected(err, session) {
    if (err) throw err;
    db = session.db("museum");
    console.log("Connected to Mongo!");
    db.createCollection("vime", collectionCreated);
}

function collectionCreated(err, res) {
    if (!err) console.log("Collection 'vime' created!");
    collection = db.collection("vime");
    (async () => {
        let count = await countUsers();
        console.log(`Currently there are ${count} users in the database`);
    })();
    startScanning(1);
}

async function countUsers() {
    return new Promise((resolve, reject) => collection
        .countDocuments(function (err, data) {
            err
                ? reject(err)
                : resolve(data);
        }));
}

function findFresh(from) {
    return new Promise((resolve, reject) => collection
        .find({
            id: { "$gte": from },
            lastUpdate: { "$gt": Date.now() - 6 * 60 * 60 * 1000 }
        })
        .limit(1000)
        .toArray(function (err, data) {
            err
                ? reject(err)
                : resolve(data);
        }));
};

async function findToken() {
    return new Promise((ok, err) => {

        if (!tokens) {
            ok(null);
            return;
        }

        let nearestToken;
        let nearestTime = 1e99;
        let time = Date.now();
        for (let token of tokens) {
            if (token.requestsLeft > 0) {
                ok(token);
                return;
            }
            if (token.resetTime < nearestTime) {
                nearestTime = token.resetTime;
                nearestToken = token;
            }
        }

        if (time > nearestTime) {
            ok(nearestToken);
            return;
        }

        console.log(`All tokens are expired, the nearest one will be available in ${Math.ceil((nearestTime - time) / 1000)}s.`)

        setTimeout(() => ok(nearestToken), nearestTime - time);
    });
}

async function startScanning(from) {

    let i = 1;
    let start = Date.now();
    while (i < 10_000_000) {
        let from = i;
        i = await scan(i);
        if (from != i) {
            console.log(`Range ${from}-${i} took ${Date.now() - start} ms.`)
            start = Date.now();
        }
    }

}

async function scan(from) {

    // console.log("Fetching fresh users...")
    // let freshUsers = await findFresh(from);
    // console.log("Got " + freshUsers.length + " fresh users")
    let usersToCheck = [];
    let to = from + 1000;
    for (let id = from; id < to; id++) {
        // let isFresh = false;
        // for (let freshUser in freshUsers) {
        //     if (freshUser.id == id) isFresh = true;
        // }
        // if (isFresh) to++;
        // else 
        usersToCheck.push(id);
    }

    let token = await findToken();

    let response = await axios({
        method: 'post',
        url: 'https://api.vime.world/user/session',
        data: usersToCheck,
        headers: token ? {
            'Access-Token': token.token
        } : {},
    });

    token.requestsLeft = +response.headers['x-ratelimit-remaining'];
    token.resetTime = (+response.headers['x-ratelimit-reset-after'] + 1) * 1000 + Date.now();

    let error = response.data.error;
    if (error) {
        console.log(error.error_msg)
        return from;
    } else {
        let bulk = collection.initializeUnorderedBulkOp();
        response.data.forEach(user => {
            user.lastUpdate = Date.now()
            delete user.online
            user.guild = user.guild ? user.guild.id : 0;
            bulk.find({ id: user.id }).upsert().update({ $set: user });
        });
        bulk.execute();
        return to;
    }


}



