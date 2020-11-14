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

        setTimeout(() => ok(nearestToken), time - nearestTime);
    });
}

async function startScanning(from) {

    let i = 1;
    while (i < 10_000_000) {
        i = await scan(i);
        console.log(`i is now ${i}`)
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
    console.log(token);

    let response = await axios({
        method: 'post',
        url: 'https://api.vime.world/user/session',
        data: usersToCheck,
        headers: token ? {
            'Access-Token': token.token
        } : {},
    });

    let error = response.data.error;
    if (error) {
        console.log(error.error_msg)
    } else {
        token.requestsLeft = response.headers['X-RateLimit-Remaining']
        token.resetTime = Date.now() + response.headers['X-RateLimit-Reset-After']
        let bulk = collection.initializeUnorderedBulkOp();
        response.data.forEach(user => {
            user.lastUpdate = Date.now()
            delete user.online
            bulk.find({ id: user.id }).upsert().update({ $set: user });
        });
        bulk.execute((err, res) => {
            if (err) throw err
        });
    }
    return to;


}



