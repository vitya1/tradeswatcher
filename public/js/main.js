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
            sellings: []
        };
        for(let i = 0; i < t.length; i++) {
            //purchases first
            if(data['amount'] == 0 && t[i]['type'] == 'sell') {
                continue;
            }

            if(t[i]['type'] == 'buy') {
                data['amount'] += t[i]['quantity'];
                data.purchases.push({amount: t[i]['quantity'], price: t[i]['unit price']});
                data.average_buy_price = (data.average_buy_price + t[i]['unit price']) / data.purchases.length;
            }
            else {
                data['amount'] -= t[i]['quantity'];
                data.sellings.push({amount: t[i]['quantity'], price: t[i]['unit price']});
                data.average_sell_price = (data.average_sell_price + t[i]['unit price']) / data.sellings.length;
            }

            data.fee += t[i]['fee'];
            data.actions++;
            data.volume += t[i]['price'];
        }

        let gain = this._calculateGain(data);
        data.gain = gain.value - data.fee;
        if(gain.total_traded_buy_cost > 0) {
            data.gain_percent = (data.gain / gain.total_traded_buy_cost) * 100;
        }
        return data;
    }

    _calculateGain(data) {
        let gain = {value: 0, total_traded_buy_cost: 0};
        for(let i = 0; i < data.purchases.length; i++) {
            let p = data.purchases[i];
            if(p.amount == 0) {
                continue;
            }
            for(let j = 0; j < data.sellings.length; j++) {
                let s = data.sellings[j];
                if(s.amount == 0) {
                    continue;
                }
                if(p.amount == 0) {
                    break;
                }
                let amount = p.amount > s.amount ? s.amount : p.amount;
                gain.value += amount * s.price - amount * p.price;
                gain.total_traded_buy_cost += amount * p.price;

                data.purchases[i].amount -= amount;
                data.sellings[j].amount -= amount;

            }
        }

        return gain;
    }

    prepareForGrid(data) {
        return {
            'pair': data.pair,
            'gain': +data.gain.toFixed(this.precision),
            'gain %': +data.gain_percent.toFixed(2),
            'fees': +data.fee.toFixed(this.precision),
            'trades': data.actions,
            'volume': +data.volume.toFixed(this.precision),
            'average buy': +data.average_buy_price.toFixed(this.precision),
            'average sell': +data.average_sell_price.toFixed(this.precision)
        };
    }

};

// register the grid component
Vue.component('grid', {
    template: '#grid-template',
    replace: true,
    props: {
        data: Array,
        columns: Array,
        filterKey: String
    },
    data: function () {
        var sortOrders = {}
        this.columns.forEach(function (key) {
            sortOrders[key] = 1
        })
        return {
            sortKey: '',
            sortOrders: sortOrders
        }
    },
    computed: {
        filteredData: function () {
            var sortKey = this.sortKey
            var filterKey = this.filterKey && this.filterKey.toLowerCase()
            var order = this.sortOrders[sortKey] || 1
            var data = this.data
            if (filterKey) {
                data = data.filter(function (row) {
                    return Object.keys(row).some(function (key) {
                        return String(row[key]).toLowerCase().indexOf(filterKey) > -1
                    })
                })
            }
            if (sortKey) {
                data = data.slice().sort(function (a, b) {
                    a = a[sortKey]
                    b = b[sortKey]
                    return (a === b ? 0 : a > b ? 1 : -1) * order
                })
            }
            return data
        }
    },
    filters: {
        capitalize: function (str) {
            return str.charAt(0).toUpperCase() + str.slice(1)
        }
    },
    methods: {
        sortBy: function (key) {
            this.sortKey = key
            this.sortOrders[key] = this.sortOrders[key] * -1
        }
    }
});

let socket = io.connect('//localhost:3001');

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

        if(app.common_stats.date_start == 0 || app.common_stats.date_start >= val.time) {
            app.common_stats.date_start = val.time;
        }
        if(app.common_stats.date_end == 0 || app.common_stats.date_end <= val.time) {
            app.common_stats.date_end = val.time;
        }
    });

    const stat = new Statistic();
    let common_statistic = {};
    for(let pair in res_sorted) {
        let row = stat.calculate(res_sorted[pair]);
        if(row.actions == 0) {
            continue;
        }
        app.common_stats.fee += row.fee;
        app.common_stats.volume += row.volume;
        app.common_stats.gain += row.gain;

        app.results_data.push(stat.prepareForGrid(row));
    }
};

const app = new Vue({
    el: '#app',
    data: {
        api_key: '',
        secret_key: '',

        grid_columns: ['time', 'type', 'pair', 'price', 'unit price', 'quantity', 'fee'],
        grid_data:[],

        results_columns:['pair', 'gain', 'gain %', 'fees', 'trades', 'volume', 'average buy', 'average sell'],
        results_data: [],

        common_stats: {
            fee: 0,
            volume: 0,
            gain: 0,
            date_start: 0,
            date_end: 0
        }
    },
    methods: {
        loadFile: function(e) {
            let t = document.getElementById('file_content').files[0];
            if(t.type !== 'text/csv') {
                console.log('Wrong file type');
                return;
            }
            if(t.size > 111111) {
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
                updateTable(this, response.data);
            });
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
            this.common_stats = {
                fee: 0,
                volume: 0,
                gain: 0,
                date_start: 0,
                date_end: 0
            };
        }
    }
});

socket.on('loadData', data => {
    updateTable(app, data);
});

