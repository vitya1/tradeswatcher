const https = require('https');
const fs = require('fs');
const progress = require('progress');

"use strict";

function saveStats(pair, period, callback) {
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
    const block_in_day = 16;
    const sec_in_day = 24 * 3600;
    let start = Math.floor(Date.now() / 1000);
    let end = start - 4 * sec_in_day;
    let requests = [];
    let bar = new progress('Parsing [:bar] :percent Items :last_parsed', {
        complete: '=',
        incomplete: ' ',
        width: 30,
        total: period * block_in_day
    });
    for(let i = 1; i <= period * block_in_day; i++) {
        let start = end - sec_in_block;
        let url = 'https://poloniex.com/public?command=returnTradeHistory&currencyPair=' + pair + '&start=' + start + '&end=' + end;
        let t = doRequest.bind(this, url);
        requests.push(t);
        end = start;
    }

    const wstream = fs.createWriteStream('./' + pair + '.json', {flags: 'a'});
    wstream.write('[');
    promiseWaterfall(wstream, requests).then(res => {
        console.log('Total elements:' + res.elements + '; blocks: ' + res.blocks + ' (block size ' + sec_in_block + 'sec.); parsed period: '
            + res.blocks * sec_in_block / sec_in_day + ' day(s) (Start ' + new Date(end*1000) + '(' + end + ')), end ' + new Date(start*1000) + '(' + start + '))');

        wstream.write(']');
        wstream.end();

        if(callback) {
            callback();
        }
    }, reason => {
        console.log('Something wrong happened:', reason);
    });

}
