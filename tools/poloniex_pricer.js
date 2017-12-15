const https = require('https');
const fs = require('fs');
const progress = require('progress');

"use strict";

function saveStats(pair, date_start, callback) {
    console.log('Start pair ' + pair);
    function doRequest(url) {
        return new Promise ((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode >= 300 && res.statusCode <= 400 && res.headers.location) {
                    doRequest(res.headers.location).then(res => {
                        resolve(res);
                    });
                    return;
                }
                let data = '';
                res.on('data', d => {
                    data += d;
                });
                res.on('end', () => {
                    try {
                        let result = JSON.parse(data);
                        bar.tick({
                            last_parsed: result.length
                        });
                        resolve(result);
                    }
                    catch(e) {
                        console.log('Parse error! Reparsing...');
                        doRequest(url).then(res => {
                            resolve(res);
                        });
                        return;
                    }
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
        let sep = '';
        return new Promise((resolve, reject) => {
            function next() {
                if(index < array.length) {
                    array[index++]().then(val => {
                        val.reverse();
                        while(val.length > 0) {
                            let data = JSON.stringify(val.pop());
                            wstream.write(sep + data);
                            if(!sep) {
                                sep = ',';
                            }
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
    let requests = [];
    let date_end = Math.floor(Date.now() / 1000);
    for(let i = date_start; i <= date_end; i += sec_in_block) {
        let url = 'https://poloniex.com/public?command=returnTradeHistory&currencyPair=' + pair + '&start=' + i + '&end=' + (i + sec_in_block);
        let t = doRequest.bind(this, url);
        requests.push(t);
    }
    let bar = new progress('Parsing [:bar] :percent Items :last_parsed', {
        complete: '=',
        incomplete: ' ',
        width: 30,
        total: Math.round((date_end - date_start) / sec_in_block)
    });

    const wstream = fs.createWriteStream('./' + pair + '.json', {flags: 'w'});
    wstream.write('[');
    promiseWaterfall(wstream, requests).then(res => {
        console.log('Total elements:' + res.elements + '; '
           + 'Start ' + new Date(date_start*1000) + '(' + date_start + ')), end ' + new Date(date_end*1000) + '(' + date_end + ')');

        wstream.write(']');
        wstream.end();

        if(callback) {
            callback();
        }
    }, reason => {
        console.log('Something wrong happened:', reason);
    });

}

//example usages for USDT_BTC 2017-01-01 00:00:00
//saveStats('USDT_BTC', 1483228800);