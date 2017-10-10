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
app.use('/bower_components',  express.static(__dirname + '/bower_components'));
app.use('/public',  express.static(__dirname + '/public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/html/index.html');
});

function readCsv(filename, callback) {
    const read_stream = fs.createReadStream(filename);
    const rl = readline.createInterface({
        input: read_stream
    });
    let result = [];

    let first = true;
    rl.on('line', line => {
        if(first) {
            first = !first;
            return;
        }
        let data = line.replace(/"/g, '').split(',');
        result.push({
            'type': data[3].indexOf('Buy') !== -1 ? 'buy': 'sell',
            'pair': data[2],
            'unit price': +data[4],
            'quantity': +data[6],
            'price': +(data[8] < 0 ? data[8] * -1 : data[8]),
            'fee': 0,
            'time': data[0]
        });
    });

    read_stream.on('end', () => {
        callback(result);
    });

}

app.post('/upload', upload.single('csv_file'), (req, res, next) => {
    console.log(req.file);
    const max_csv_size = 111111;
    if(req.file['mimetype'] !== 'text/csv') {
        console.log('Wrong file type');
    }
    if(req.file['size'] > max_csv_size) {
        console.log('File is too big');
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
                    if(data['result'][i]['Balance'] == 0) {
                        continue;
                    }
                    result.push({
                        'type': data['result'][i]['OrderType'].indexOf('BUY') !== -1 ? 'buy': 'sell',
                        'pair': data['result'][i]['Exchange'],
                        'unit price': data['result'][i]['PricePerUnit'],
                        'quantity': data['result'][i]['Quantity'],
                        'price': data['result'][i]['Price'],
                        'fee': data['result'][i]['Commission'],
                        'time': data['result'][i]['TimeStamp']
                    });
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


