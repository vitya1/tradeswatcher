const https = require('https');
const fs = require('fs');

"use strict";

function saveStats(pair, period) {
    function doRequest(url) {
        return new Promise ((resolve, reject) => {
            console.log(url);
            https.get(url, (res) => {
                if (res.statusCode >= 300 && res.statusCode <= 400 && res.headers.location) {
                    doRequest(res.headers.location);
                }
                let data = '';
                res.on('data', d => {
                    data += d;
                });
                res.on('end', () => {
                    let result = JSON.parse(data);
                    console.log('Parsed ' + result.length + ' items');
                    resolve(JSON.parse(data));
                });

            }).on('error', (e) => {
                console.log(e);
                reject(e);
            });
        });
    }

    function promiseWaterfall(array) {
        let index = 0;
        return new Promise((resolve, reject) => {
            function next() {
                if(index < array.length) {
                    array[index++]().then(next, reject);
                }
                else {
                    resolve();
                }
            }
            next();
        });
    }

    const sec_in_month = 5400; // 1/12 days
    let end = Math.floor(Date.now() / 1000 - 4 * 24 * 3600);
    let requests = [];
    for(let i = 1; i <= period; i++) {
        let start = end - sec_in_month;
        //console.log(start, end, end - start);
        let url = 'https://poloniex.com/public?command=returnTradeHistory&currencyPair=' + pair + '&start=' + start + '&end=' + end;
        let t = doRequest.bind(this, url);
        requests.push(t);
        end = start;
    }

    promiseWaterfall(requests).then(values => {
        let val = [];
        values.forEach(item => {
            val = val.concat(item);
        });

        console.log('Total elements:' + val.length + '; months: ' + values.length);
        fs.writeFile('./' + pair + '.json', JSON.stringify(val), function(err) {
            if(err) {
                return console.log(err);
            }
            console.log("The file was saved!");
        });

    }, reason => {
        console.log('Something wrong happened:', reason);
    });

}

saveStats('BTC_BCH', 1440);

function groupData(data, length) {
    let chart = [];
    let cur = {t: null,o: null,h: null,l: null,c: null};
    let start_time_period = null;
    //@todo не обрабатывается (вставляется) последний бар
    //@todo не учитывается что бары могут быть разряженные. сейчас все бары будут друг ха другом даже если они на расстоянии много больше ltngth друг от друга
    for(let i = 0; i < data.length; i++) {
        let item = data[i];
        let d = (new Date(item['date'])).getTime();
        //initialising the first bar
        if(start_time_period == null) {
            start_time_period = d;
            cur = {t: start_time_period,o: item['rate'],h: item['rate'],l: item['rate'],c: item['rate']};
            continue;
        }
        if(d - start_time_period > length) {
            start_time_period += length;
            chart.push({t: (new Date(cur['t'])).getTime(),o: parseFloat(cur['o']),h: parseFloat(cur['h']),l: parseFloat(cur['l']),c: parseFloat(cur['c'])});
            cur = {t: start_time_period,o: item['rate'],h: item['rate'],l: item['rate'],c: item['rate']};
            continue;
        }

        if(cur['h'] < item['rate']) {
            cur['h'] = item['rate'];
        }
        if(cur['l'] > item['rate']) {
            cur['l'] = item['rate'];
        }
        cur['c'] = item['rate'];
    }

    return chart;
}
/*

fs.readFile('./BTC_BCH.json', 'utf-8', (err, data) => {
    let array = JSON.parse(data);
    array.reverse();
    let chart = groupData(array, 5 * 60 * 1000);
    //console.log(chart);
});

*/
