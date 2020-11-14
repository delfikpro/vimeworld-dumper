const axios = require('axios');

vimeworldTokens = []

function addToken(token) {
    vimeworldTokens.push({
        token: token.replace(/[^A-Za-z0-9]/g, ''),
        requestsLeft: -1,
        resetTime: 0
    });
}

function findToken() {
    return new Promise((ok, err) => {

        if (!vimeworldTokens) {
            ok(null);
            return;
        }

        let nearestToken;
        let nearestTime = 1e99;
        let time = Date.now();
        for (let token of vimeworldTokens) {
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

async function massSession(userIds) {
    let token = await findToken();

    let response = await axios({
        method: 'post',
        url: 'https://api.vime.world/user/session',
        data: userIds,
        headers: token ? {
            'Access-Token': token.token
        } : {},
    });

    token.requestsLeft = +response.headers['x-ratelimit-remaining'];
    token.resetTime = (+response.headers['x-ratelimit-reset-after'] + 1) * 1000 + Date.now();

    let error = response.data.error;
    if (error) {
        console.log(error.error_msg)
        return await massSession(userIds);
    } else {
        return response.data;
    }
}

module.exports = { addToken, massSession }
