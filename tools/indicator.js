
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
    subject = subject || 'c'; //means close
    let sma = [];
    for(let i = 0; i < period - 1; i++) {
        sma.push(null);
    }
    for(let i = period - 1; i < chart.length; i++) {
        let sma_i = 0;
        for(let j = 0; j < period; j++) {
            sma_i += chart[i - j][subject];
        }
        sma.push(sma_i / period);
    }
    return sma;
}
