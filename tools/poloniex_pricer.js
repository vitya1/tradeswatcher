const https = require('https');
const fs = require('fs');

"use strict";

function saveStats(pair, period, callback) {
    console.log('Start pair ' + pair);
    function doRequest(url) {
        return new Promise ((resolve, reject) => {
            console.log(url);
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
                        console.log('Parsed ' + result.length + ' items');
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
    let end = Math.floor(Date.now() / 1000 - 4 * sec_in_day);
    let requests = [];
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
        console.log('Total elements:' + res.elements + '; blocks: ' + res.blocks + ' (block size ' + sec_in_block + 'sec.); parsed period: '+ res.blocks * sec_in_block / sec_in_day + ' day(s)');

        wstream.write(']');
        wstream.end();

        if(callback) {
            callback();
        }
    }, reason => {
        console.log('Something wrong happened:', reason);
    });

}


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
            chart.push({ht: (new Date(cur['t'])), t: (new Date(cur['t'])).getTime(),o: parseFloat(cur['o']),h: parseFloat(cur['h']),l: parseFloat(cur['l']),c: parseFloat(cur['c'])});
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

function rawToChart(file, chart_period) {
    const stream = fs.createReadStream(file, {flags: 'r', encoding: 'utf-8'});
    let buf = '';

    let data = [];
    stream.on('data', function(d) {
        buf += d.toString();

        let pos;
        while ((pos = buf.indexOf('},{')) >= 0 || (pos = buf.indexOf('}]')) >= 0) {
            if(pos == 0) {
                buf = buf.slice(1);
                continue;
            }
            let line = buf.slice(1, pos + 1);
            try {
                data.push(JSON.parse(line));
            }
            catch(e) {
                line.split('}{').forEach((elem, index) => {
                    data.push(elem);
                    console.log('better this than sorry');
                });
            }

            buf = buf.slice(pos + 1);
        }
    });
    stream.on('end', function() {
        let chart = groupData(data, chart_period * 60 * 1000);
        fs.writeFile(file.replace('.json', '') + '_chart_' + chart_period + '.json', JSON.stringify(chart), () => {});
    });
}

function extractChartParam(chart, param, file) {
    let data = [];
    for(let i = 0; i < chart.length; i++) {
        data.push(chart[i][param]);
    }
    fs.writeFile(file, JSON.stringify(data), (err, data) => {});
}

function calculateEMA(chart, period, subject) {
    subject = subject || 'c';
    let a = 2 / (period + 1);
    let ema = [];
    let ema_prev = chart[0][subject];
    for(let i = 1; i < chart.length; i++) {
        let ema_cur = a * chart[i][subject] + (1 - a) * ema_prev;
        ema.push(ema_cur);
        ema_prev = ema_cur;
    }

    return ema;
}


function calculateSMA(chart, period, subject) {
    subject = subject || 'c'; //close
    let sma = [];
    //@todo fill first with null
    for(let i = period - 1; i < chart.length; i++) {
        let sma_i = 0;
        for(let j = 0; j < period; j++) {
            sma_i += chart[i - j][subject];
        }
        sma.push(sma_i / period);
    }
    return sma;
}
