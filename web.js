const bittrex = require('node.bittrex.api');
//const fs = require('fs');
const express = require('express');
const app = express();
//const hbs = require('express-handlebars');
//const robots = require('express-robots');
const server = require('http').createServer(app);
const io = require('socket.io')(server);
//const net = require('net');
//const os = require('os');

const multer  = require('multer');
const upload = multer({ dest: 'uploads/' });

"use strict";

var cpUpload = upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'gallery', maxCount: 8 }])
app.post('/cool-profile', cpUpload, function (req, res, next) {
    // req.files is an object (String -> Array) where fieldname is the key, and the value is array of files
    //
    // e.g.
    //  req.files['avatar'][0] -> File
    //  req.files['gallery'] -> Array
    //
    // req.body will contain the text fields, if there were any
})


//app.engine('hbs', hbs({extname: 'hbs'}));
//app.set('views', (__dirname + '/views'));
//app.set('view engine', 'hbs');

app.use(express.static(__dirname + '/public'));
app.use('/bower_components',  express.static(__dirname + '/bower_components'));
app.use('/public',  express.static(__dirname + '/public'));

app.get('/', function (req, res) {
    //res.render('index', {url: req.get('host')});
    res.sendFile(__dirname + '/public/html/index.html');
});

var cpUpload = upload.fields([{ name: 'picture'}]);
app.put('/api', cpUpload, function(req, res, next) {
    console.log(req.files);
    console.log(req.file);
    console.log(req.body);
//    res.render('index', {url: req.get('host')});
});


app.use(function(req, res) {
    res.status(404);
    res.send('404. Page does not exist');
});

io.on('connection', socket => {
    socket.on('loadData', data => {

        try {
            bittrex.options({
                'apikey': data['api_key'],
                'apisecret': data['secret_key'],
            });

            let url = 'https://bittrex.com/api/v1.1/account/getorderhistory';
            bittrex.sendCustomRequest(url, function(data, err) {
                if(err) {
                    throw e;
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


