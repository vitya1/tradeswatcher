<?php

// API settings
$key = 'CPNHU5SL-9LEZH7H6-MFIVI8GQ-SZTXD94F';
$secret = '4b20fa9efc995af346b66662f593f852d9c05f9d6dd5d4d5df1fb65310731be257b0c29921ac3d2bc694c4f4e0a5ca8ab66aa7c7099b0c7a4ae13d33e693f6fe';

$req = [
    'command' => 'returnTradeHistory',
    'currencyPair' => 'all',
    'satrt' => time() - 30 * 86400,
    'end' => time(),
    'limit' => 500
];

// generate a nonce to avoid problems with 32bit systems
$mt = explode(' ', microtime());
$req['nonce'] = $mt[1].substr($mt[0], 2, 5);

// generate the POST data string
$post_data = http_build_query($req, '', '&');
$sign = hash_hmac('sha512', $post_data, $secret);

// generate the extra headers
$headers = array(
'Key: '.$key,
'Sign: '.$sign,
);

// curl handle (initialize if required)
static $ch = null;
if (is_null($ch)) {
$ch = curl_init();
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_USERAGENT,
'Mozilla/4.0 (compatible; Poloniex PHP bot; '.php_uname('a').'; PHP/'.phpversion().')'
);
}
curl_setopt($ch, CURLOPT_URL, 'https://poloniex.com/tradingApi');
curl_setopt($ch, CURLOPT_POSTFIELDS, $post_data);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, FALSE);

// run the query
$res = curl_exec($ch);

print_r($res);
