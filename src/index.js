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

var mongoClient = mongo.MongoClient(url, { useUnifiedTopology: true, useNewUrlParser: true });

var globalStart = Date.now();

mongoClient.connect(onConnected);

function onConnected(err, sess) {
    if (err) throw err;
    session = sess;
    db = session.db("museum");
    console.log("Connected to Mongo!");
    db.createCollection("vime", collectionCreated);
}

async function collectionCreated(err, res) {
    if (!err) console.log("Collection 'vime' created!");
    collection = db.collection("vime");
    let count = await countUsers();
    console.log(`Currently there are ${count} users in the database`);
    startScanning(process.argv.length > 2 ? +process.argv[2] : 1);
}

async function countUsers() {
    return new Promise((resolve, reject) => collection
        .countDocuments(function (err, data) {
            err
                ? reject(err)
                : resolve(data);
        }));
}

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

async function startScanning(startId) {

    let i = startId;
    let start = Date.now();
    while (i < 10_000_000) {
        let from = i;
        i = await scan(i);

        if (i < 0) {
            console.log('Seems like there are no players left to scan.')
            let elapsedTime = Math.ceil((Date.now() - globalStart) / 60000);
            console.log('Done in under ' + (elapsedTime == 1 ? 'a minute.' : elapsedTime + ' minutes.'));
            session.close();
            return;
        }

        if (from != i) {
            console.log(`Range ${from}-${i-1} took ${Date.now() - start} ms.`)
            start = Date.now();
        }

    }

}

function bulkExecute(op) {
    return new Promise((ok, err) => {
        op.execute((error, result) => {
            if (error) err(error);
            else ok(result);
        });
    })
}

async function scan(from) {

    let usersToCheck = [];
    let to = from + 1000;
    for (let id = from; id < to; id++) {
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
        if (response.data.length == 0) {
            return -1;
        }
        let bulk = collection.initializeUnorderedBulkOp();
        response.data.forEach(user => {
            user.lastUpdate = Date.now()
            user._id = user.id;
            delete user.id;
            delete user.online;
            user.guild = user.guild ? user.guild.id : 0;
            bulk.find({ _id: user._id }).upsert().update({ $set: user });
        });

        // collection.insertMany()
        await bulkExecute(bulk);

        return to;
    }


}



