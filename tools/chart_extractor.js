const fs = require('fs');

function rawToChart(file, chart_period) {
    const stream = fs.createReadStream(file, {flags: 'r', encoding: 'utf-8'});
    const wstream = fs.createWriteStream(file.replace('.json', '') + '_chart_' + chart_period + '.json', {flags: 'w'});
    let buf = '';

    let length = chart_period * 60 * 1000;
    let cur = {t: null,o: null,h: null,l: null,c: null};
    let start_time_period = null;
    let first = true;
    let data = [];
    wstream.write('[');
    stream.on('data', function(d) {
        buf += d.toString();

        let pos;
        while ((pos = buf.indexOf('},{')) >= 0 || (pos = buf.indexOf('}]')) >= 0) {
            if(pos == 0) {
                buf = buf.slice(1);
                continue;
            }
            let line = buf.slice(1, pos + 1);
            let item = JSON.parse(line);
            let d = (new Date(item['date'])).getTime();
            //initialising the first bar
            if(start_time_period == null) {
                start_time_period = d;
                cur = {t: start_time_period,o: item['rate'],h: item['rate'],l: item['rate'],c: item['rate']};

                buf = buf.slice(pos + 1);
            }
            if(d - start_time_period > length) {
                start_time_period += length;
                let bar = {ht: (new Date(cur['t'])), t: (new Date(cur['t'])).getTime(),o: parseFloat(cur['o']),h: parseFloat(cur['h']),l: parseFloat(cur['l']),c: parseFloat(cur['c'])};
                if(!first) {
                    first = false;
                    wstream.write(',');
                }
                wstream.write(JSON.stringify(bar));
                cur = {t: start_time_period,o: item['rate'],h: item['rate'],l: item['rate'],c: item['rate']};

                buf = buf.slice(pos + 1);
            }

            if(cur['h'] < item['rate']) {
                cur['h'] = item['rate'];
            }
            if(cur['l'] > item['rate']) {
                cur['l'] = item['rate'];
            }
            cur['c'] = item['rate'];

            buf = buf.slice(pos + 1);
        }
    });
    stream.on('end', function() {
        wstream.write(']');
    });
}

function extractChartParam(chart, param, file) {
    let data = [];
    for(let i = 0; i < chart.length; i++) {
        data.push(chart[i][param]);
    }
    fs.writeFile(file, JSON.stringify(data), (err, data) => {});
}
