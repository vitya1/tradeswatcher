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

    function promiseWaterfall(wstream, array) {
        let index = 0;
        let values = 0;
        return new Promise((resolve, reject) => {
            function next() {
                if(index < array.length) {
                    array[index++]().then(val => {
                        while(val.length > 0) {
                            let data = JSON.stringify(val.pop());
                            wstream.write(data + (val.length > 0 ? ',' : ''));
                            values++;
                        }
                        next();
                    }, reject);
                }
                else {
                    resolve({blocks: index, elements: values});
                }
            }
            next();
        });
    }

    const sec_in_block = 5400; // 1/16 days
    const block_in_day = 16;
    const sec_in_day = 24 * 3600;
    let end = Math.floor(Date.now() / 1000 - 4 * sec_in_day);
    let requests = [];
    for(let i = 1; i <= period * block_in_day; i++) {
        let start = end - sec_in_block;
        let url = 'https://poloniex.com/public?command=returnTradeHistory&currencyPair=' + pair + '&start=' + start + '&end=' + end;
        let t = doRequest.bind(this, url);
        requests.push(t);
        end = start;
    }

    let wstream = fs.createWriteStream('./' + pair + '.json', {flags: 'a'});
    wstream.write('[');
    promiseWaterfall(wstream, requests).then(res => {
        console.log('Total elements:' + res.elements + '; blocks: ' + res.blocks + ' (block size ' + sec_in_block + 'sec.); parsed period: '+ res.blocks * sec_in_block / sec_in_day + ' day(s)');

        wstream.write(']');
        wstream.end();
    }, reason => {
        console.log('Something wrong happened:', reason);
    });

}

//saveStats('BTC_ETH', 3);
saveStats('BTC_XRP', 90);

function groupData(data, length) {
    let chart = [];
    let cur = {t: null,o: null,h: null,l: null,c: null};
    let start_time_period = null;
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
