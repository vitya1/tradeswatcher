const bittrex = require('node.bittrex.api');
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const fs = require('fs');
const multer  = require('multer');
const readline = require('readline');

let upload = multer({ dest: 'uploads/' });

"use strict";

app.use(express.static(__dirname + '/public'));
app.use('/node_modules',  express.static(__dirname + '/node_modules'));
app.use('/public',  express.static(__dirname + '/public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/html/index.html');
});

function formatArray(data, type) {
    switch (type) {
        case 0:
            let res = {
                'type': data[3].indexOf('Buy') !== -1 ? 'buy': 'sell',
                'pair': data[2],
                'unit price': +data[4],
                'quantity': +data[6],
                'price': data[4] * data[6],
                'fee': 0,
                'time': data[0]
            };
            res.fee = +(data[8] < 0 ? data[8] * -1 : data[8]) - res.price;
            return res;
        case 1:
            return {
                'type': data['result'][i]['OrderType'].indexOf('BUY') !== -1 ? 'buy': 'sell',
                'pair': data['result'][i]['Exchange'],
                'unit price': data['result'][i]['PricePerUnit'],
                'quantity': data['result'][i]['Quantity'],
                'price': data['result'][i]['Price'],
                'fee': data['result'][i]['Commission'],
                'time': data['result'][i]['TimeStamp']
            };
        case 2:
            return {
                'type': data[2].indexOf('BUY') !== -1 ? 'buy': 'sell',
                'pair': data[1],
                'unit price': +data[4],
                'quantity': +data[3],
                'price': +data[6],
                'fee': +data[5],
                'time': data[8]
            };
        case 3:
            let coin = data[1].split('/');
            return {
                'type': data[3].toLowerCase(),
                'pair': coin[1] + '-' + coin[0],
                'unit price': +data[4],
                'quantity': +data[5],
                'price': +data[6],
                'fee': data[6] * parseFloat(data[7]) / 100,
                'time': data[0]
            };
    }
}
function getTypeByHeader(header) {
    if(header.indexOf('OrderUuid,Exchange,Type,Quantity,Limit,CommissionPaid,Price,Opened,Closed') !== -1) {
        return 2;
    }
    if(header.indexOf('Closed Date,Opened Date,Market,Type,Bid/Ask,Units Filled,Units Total,Actual Rate,Cost / Proceeds') !== -1) {
        return 0;
    }
    if(header.indexOf('Date,Market,Category,Type,Price,Amount,Total,Fee,Order Number,Base Total Less Fee,Quote Total Less Fee') !== -1) {
        return 3;
    }

    return null;
}

function readCsv(filename, callback) {
    const read_stream = fs.createReadStream(filename, {encoding: 'utf8'});
    const rl = readline.createInterface({
        input: read_stream
    });
    let result = [];

    let first = true;
    let type = 0;
    rl.on('line', line => {
        line = line.replace(/"/g, '').replace(/\0/g, '');
        if(line === '') {
            return;
        }
        if(first) {
            first = !first;
            //@todo check Null type
            type = getTypeByHeader(line);
            return;
        }
        let data = line.split(',');
        result.push(formatArray(data, type));
    });

    read_stream.on('end', () => {
        callback(result);
    });
}

app.post('/upload', upload.single('csv_file'), (req, res, next) => {
    console.log(req.file);
    const max_csv_size = 1111111;
    if(req.file['mimetype'] !== 'text/csv') {
        console.log('Wrong file type');
        res.status(200).end();
        return;
    }
    if(req.file['size'] > max_csv_size) {
        console.log('File is too big');
        res.status(200).end();
        return;
    }

    readCsv(req.file['path'], result => {
        fs.unlinkSync(req.file['path']);
        res.status(200).send(result).end();
    });

});


app.use((req, res) => {
    res.status(404);
    res.send('404. Page does not exist');
});

io.on('connection', socket => {
    console.log('new connection');
    socket.on('loadData', data => {

        try {
            bittrex.options({
                'apikey': data['api_key'],
                'apisecret': data['secret_key'],
            });

            let url = 'https://bittrex.com/api/v1.1/account/getorderhistory';
            bittrex.sendCustomRequest(url, (data, err) => {
                if(err) {
                    throw err;
                }
                let result = [];
                for(let i = 0; i < data['result'].length; i++) {
                    if(parseInt(data['result'][i]['Balance']) === 0) {
                        continue;
                    }
                    result.push(formatArray(data, 1));
                }

                socket.emit('loadData', result);
            }, true);
        }
        catch(e) {
            console.warn('api service connection error')
        }
    });

});

server.listen(3001, '127.0.0.1');


