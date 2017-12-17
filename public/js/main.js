"use strict";

class Statistic {

    get precision() {
        return 8;
    }

    calculate(t) {
        let data = {
            pair: t[0].pair,
            amount:0,

            gain: 0,
            gain_percent: 0,
            fee: 0,
            actions: 0, // = total amount of trades
            volume: 0,
            average_buy_price: 0,
            purchases: [],
            average_sell_price: 0,
            sellings: [],
            left_purchases: [],
            open_amount: 0,
            open_change: 0
        };
        for(let i = 0; i < t.length; i++) {
            //purchases first
            if(data['amount'] == 0 && t[i]['type'] == 'sell') {
                continue;
            }

            if(t[i]['type'] == 'buy') {
                data['amount'] += t[i]['quantity'];
                data.purchases.push({amount: t[i]['quantity'], price: t[i]['unit price']});
                data.average_buy_price += t[i]['unit price'];
            }
            else {
                data['amount'] -= t[i]['quantity'];
                data.sellings.push({amount: t[i]['quantity'], price: t[i]['unit price']});
                data.average_sell_price += t[i]['unit price'];
            }
            data.fee += t[i]['fee'];
            data.actions++;
            data.volume += t[i]['price'];
        }
        data.average_buy_price /= data.purchases.length;
        data.average_sell_price /= data.sellings.length;

        let gain = this._calculateGain(data.purchases, data.sellings);
        data.open_amount = gain.open_amount;
        data.gain = gain.value - data.fee;
        data.open_amount = gain.open_amount;
        data.left_purchases = gain.left_purchases;
        if(gain.total_traded_buy_cost > 0) {
            data.gain_percent = (data.gain / gain.total_traded_buy_cost) * 100;
        }
        return data;
    }

    _calculateGain(purchases, sellings) {
        let gain = {value: 0, total_traded_buy_cost: 0, open_amount: 0, left_purchases: []};
        for(let i = 0; i < purchases.length; i++) {
            let p = purchases[i];
            if(p.amount == 0) {
                continue;
            }
            for(let j = 0; j < sellings.length; j++) {
                let s = sellings[j];
                if(s.amount == 0) {
                    continue;
                }
                if(p.amount == 0) {
                    break;
                }
                let amount = p.amount > s.amount ? s.amount : p.amount;
                gain.value += amount * s.price - amount * p.price;
                gain.total_traded_buy_cost += amount * p.price;

                purchases[i].amount -= amount;
                sellings[j].amount -= amount;
            }
        }
        for(let i = 0; i < purchases.length; i++) {
            if(purchases[i].amount > 0) {
                gain.left_purchases.push(purchases[i]);
                gain.open_amount += purchases[i].amount;
            }
        }
        return gain;
    }

    renderGridRow(data) {
        return {
            'pair': data.pair,
            'gain': +data.gain.toFixed(this.precision),
            'gain %': +data.gain_percent.toFixed(2),
            'fees': +data.fee.toFixed(this.precision),
            'trades': data.actions,
            'volume': +data.volume.toFixed(this.precision),
            'average buy': +data.average_buy_price.toFixed(this.precision),
            'average sell': +data.average_sell_price.toFixed(this.precision),
            'open amount': +data.open_amount.toFixed(this.precision),
            'open pos. cost': 0
        };
    }

};

Vue.component('grid', {
    template: '#grid-template',
    replace: true,
    props: {
        data: Array,
        columns: Array,
    },
    data: function () {
        var sortOrders = {};
        this.columns.forEach(function (key) {
            sortOrders[key] = 1;
        });
        return {
            sortKey: '',
            sortOrders: sortOrders
        }
    },
    computed: {
        filteredData: function () {
            var sortKey = this.sortKey;
            var order = this.sortOrders[sortKey] || 1;
            var data = this.data;
            if (sortKey) {
                data = data.slice().sort(function (a, b) {
                    a = a[sortKey];
                    b = b[sortKey];
                    return (a === b ? 0 : a > b ? 1 : -1) * order;
                })
            }
            return data;
        }
    },
    filters: {
        capitalize: function (str) {
            return str.charAt(0).toUpperCase() + str.slice(1)
        }
    },
    methods: {
        sortBy: function (key) {
            this.sortKey = key;
            this.sortOrders[key] = this.sortOrders[key] * -1;
        }
    }
});

let socket = io.connect('//localhost:3001');

let formatInputDate = function(raw_date) {
    let date = (new Date(raw_date));
    let m = date.getMonth() + 1;
    m = m > 9 ? m : '0' + m;
    let d = date.getDate() > 9 ? date.getDate() : '0' + date.getDate();
    return date.getFullYear() + '-' + m + '-' + d;
};
let updateFilterDates = function(app) {
    app.grid_data.forEach(val => {
        let timespamp = (new Date(val.time)).getTime();

        if(app.common_stats.date_start == 0
            || app.common_stats.date_start >= timespamp) {
            app.common_stats.date_start = timespamp;
        }
        if(app.common_stats.date_end == 0
            || app.common_stats.date_end <= timespamp) {
            app.common_stats.date_end = timespamp;
        }
    });
    app.common_stats.date_end = formatInputDate(app.common_stats.date_end);
    app.common_stats.date_start = formatInputDate(app.common_stats.date_start);
};

let prices = {};
let updateTable = function(app, data) {
    app.resetStatistic();
    app.grid_data = data;

    data.reverse();
    let res_sorted = {};
    data.forEach(val => {
        if(!res_sorted.hasOwnProperty(val['pair'])) {
            res_sorted[val['pair']] = [];
        }
        res_sorted[val['pair']].push(val);
    });

    let traded_coins = [];
    const stat = new Statistic();
    for(let pair in res_sorted) {
        let row = stat.calculate(res_sorted[pair]);
        if(row.actions == 0) {
            continue;
        }
        let base_coin = pair.split('-')[0];
        let sec_coin = pair.split('-')[1];
        if(traded_coins.indexOf(sec_coin) == -1) {
            traded_coins.push(sec_coin);
        }
        app.common_stats.fee.set(base_coin, (app.common_stats.fee.has(base_coin)
                ? app.common_stats.fee.get(base_coin) : 0) + row.fee);
        app.common_stats.volume.set(base_coin, (app.common_stats.volume.has(base_coin)
                ? app.common_stats.volume.get(base_coin) : 0) + row.volume);
        app.common_stats.gain.set(base_coin, (app.common_stats.gain.has(base_coin)
                ? app.common_stats.gain.get(base_coin) : 0) + row.gain);

        app.calculated_stats.push(row);
        app.results_data.push(stat.renderGridRow(row));
    }

    socket.emit('getPrices', {'coins': traded_coins});
};

const app = new Vue({
    el: '#app',
    data: {
        api_key: '',
        secret_key: '',

        raw_data: [],

        grid_columns: ['time', 'type', 'pair', 'price', 'unit price', 'quantity', 'fee'],
        grid_data:[],

        results_columns:['pair', 'gain', 'fees', 'trades', 'volume', 'average buy', 'average sell', 'open amount', 'open pos. cost'],
        results_data: [],
        calculated_stats: [],

        common_stats: {
            fee: new Map(),
            volume: new Map(),
            gain: new Map(),
            date_start: 0,
            date_end: 0
        }
    },
    computed: {
        common_fee: function() {
            return this.renderStatistic(this.common_stats.fee);
        },
        common_volume: function() {
            return this.renderStatistic(this.common_stats.volume);
        },
        common_gain: function() {
            return this.renderStatistic(this.common_stats.gain);
        }
    },
    methods: {
        loadFile: function(e) {
            let t = document.getElementById('file_content').files[0];
            if(t.type !== 'text/csv') {
                console.log('Wrong file type');
                return;
            }
            if(t.size > 1111111) {
                console.log('File is too big');
                return;
            }
            let form_data = new FormData();
            form_data.append('csv_file', t);
            this.$http.post('/upload', form_data, {
                headers: {
                    'Content-Type': 'multipart/form-data; boundary=' + Date.now()
                }
            }).then(response => {
                app.raw_data = response.data;
                updateTable(this, response.data);
                updateFilterDates(app);
            });
        },
        filterGrid: function() {
            let date_end = (new Date(this.common_stats.date_end + ' 23:59:59')).getTime();
            let date_start = (new Date(this.common_stats.date_start)).getTime();
            this.grid_data = this.raw_data.filter((row) => {
                let cur_date = (new Date(row.time)).getTime();
                return date_start <= cur_date && date_end >= cur_date;
            });

            //@todo make binding
            updateTable(this, this.grid_data);
        },
        loadData: function(e) {
            e.preventDefault();
            socket.emit('loadData', {
                api_key: this.api_key,
                secret_key: this.secret_key
            });
        },
        resetStatistic: function() {
            this.grid_data = [];
            this.results_data = [];
            this.common_stats.fee = new Map();
            this.common_stats.volume = new Map();
            this.common_stats.gain = new Map();
        },
        renderStatistic: function(items) {
            let res = [];
            for(let data of items.entries()) {
                res.push(data[1].toFixed(6) + ' ' + data[0]);
            }
            return res.join(', ');
        }
    }
});

socket.on('loadData', data => {
    app.raw_data = data;
    updateTable(app, data);
    updateFilterDates(app);
});

socket.on('loadPrices', data => {
    prices = data;
    const stat = new Statistic();
    for(let i in app.results_data) {
        if(app.results_data[i]['open amount'] > 0) {
            let base_coin = app.results_data[i]['pair'].split('-')[0];
            let sec_coin = app.results_data[i]['pair'].split('-')[1];
            if(!data[sec_coin]) {
                //wtf?
                continue;
            }
            let price = 0;
            if(base_coin == 'BTC') {
                price = data[sec_coin].price_btc;
            }
            else if(base_coin == 'USDT') {
                price = data[sec_coin].price_usd;
            }
            else {
                continue;
            }
            app.results_data[i]['open pos. cost'] = (app.results_data[i]['open amount'] * price).toFixed(6);
        }
    }
});