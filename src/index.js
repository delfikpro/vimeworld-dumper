const mongo = require('mongodb');
const yargs = require('yargs');
const vimeworld = require('./vimeworld')

const argv = yargs
    .option('speed', {
        description: 'How much concurrent scanners will be running at the same time',
        alias: 's',
        type: 'number',
    })
    .help()
    .alias('help', 'h')
    .argv;

const speed = argv.speed || 4;
if (speed != 1)
    console.log(`Using ${speed} parrallel scanners`);

process.env.VIMEWORLD_TOKENS.split(',').forEach(vimeworld.addToken);

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

    for (let i = 0; i < speed; i++) {
        startScanning(i * 1000, speed * 1000);
    }
}

async function countUsers() {
    return new Promise((resolve, reject) => collection
        .countDocuments(function (err, data) {
            err
                ? reject(err)
                : resolve(data);
        }));
}


async function startScanning(startId, step) {

    let currentId = startId;
    while (currentId < 10_000_000) {
        let startTime = Date.now();
        let playersLeft = await scan(currentId);

        if (!playersLeft) {
            console.log('Seems like there are no players left to scan.')
            let elapsedTime = Math.ceil((Date.now() - globalStart) / 60000);
            console.log('Done in under ' + (elapsedTime == 1 ? 'a minute.' : elapsedTime + ' minutes.'));
            session.close();
            return;
        }

        console.log(`Range ${Math.floor(currentId / 1000)}XXX took ${Date.now() - startTime} ms.`);
        currentId += step;
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

    let users = await vimeworld.massSession(usersToCheck);

    if (users.length == 0) {
        return false;
    }

    let bulk = collection.initializeUnorderedBulkOp();
    users.forEach(user => {
        user.lastUpdate = Date.now()
        user._id = user.id;
        delete user.id;
        delete user.online;
        user.guild = user.guild ? user.guild.id : 0;
        bulk.find({ _id: user._id }).upsert().update({ $set: user });
    });

    await bulkExecute(bulk);

    return true;
}



