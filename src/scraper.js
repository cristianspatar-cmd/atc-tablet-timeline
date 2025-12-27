"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var https_1 = require("https");
var url = 'https://flightplan.romatsa.ro/init/fpl/flightslr/LRSV';
/**
 * Acest script descarcă datele de zbor de la ROMATSA pentru LRSV.
 *
 * CUM SE RULEAZĂ:
 * 1. Asigură-te că ai instalat TypeScript și ts-node:
 *    npm install -g typescript ts-node
 * 2. Rulează scriptul:
 *    ts-node src/scraper.ts
 *
 * NOTĂ:
 * Acest script folosește expresii regulate (regex) pentru a extrage datele din HTML.
 * Această metodă este fragilă și se poate strica dacă ROMATSA modifică structura paginii.
 * În mod normal, s-ar folosi o bibliotecă de parsare HTML (ex: cheerio, jsdom),
 * dar am evitat dependențele externe din cauza restricțiilor de mediu (npm nu poate fi rulat).
 */
function fetchAndParseFlights() {
    https_1.default.get(url, function (res) {
        var html = '';
        res.on('data', function (chunk) {
            html += chunk;
        });
        res.on('end', function () {
            try {
                var arrivals = parseTable(html, '<h3>ARR LRSV</h3>');
                var departures = parseTable(html, '<h3>DEP LRSV</h3>');
                console.log('--- SOSIRI (ARR) ---');
                if (arrivals.length) {
                    console.table(arrivals);
                }
                else {
                    console.log('Nu s-au găsit date pentru sosiri.');
                }
                console.log('\n--- PLECĂRI (DEP) ---');
                if (departures.length) {
                    console.table(departures);
                }
                else {
                    console.log('Nu s-au găsit date pentru plecări.');
                }
            }
            catch (error) {
                console.error('A apărut o eroare la parsarea datelor:', error);
            }
        });
    }).on('error', function (err) {
        console.error('Eroare la accesarea URL-ului:', err.message);
    });
}
function parseTable(html, tableHeader) {
    var tableRegex = new RegExp("".concat(tableHeader, "[sS]*?<table.*?>(.*?)</table>"), 'is');
    var tableMatch = html.match(tableRegex);
    if (!tableMatch || !tableMatch[1]) {
        // Returnează un array gol dacă tabelul nu este găsit
        return [];
    }
    var rowsHtml = tableMatch[1];
    var rows = rowsHtml.match(/<tr.*?>([\s\S]*?)<\/tr>/gis) || [];
    if (rows.length < 2)
        return []; // Header + data rows
    var headers = (rows[0].match(/<th.*?>([\s\S]*?)<\/th>/gis) || [])
        .map(function (header) { return header.replace(/<.*?>/g, '').trim(); });
    var data = [];
    var _loop_1 = function (i) {
        var cells = (rows[i].match(/<td.*?>([\s\S]*?)<\/td>/gis) || [])
            .map(function (cell) { return cell.replace(/<.*?>/g, '').replace(/&nbsp;/g, '').trim(); });
        if (cells.length === headers.length) {
            var flight_1 = {};
            headers.forEach(function (header, index) {
                flight_1[header] = cells[index];
            });
            data.push(flight_1);
        }
    };
    for (var i = 1; i < rows.length; i++) {
        _loop_1(i);
    }
    return data;
}
// Pornim procesul
fetchAndParseFlights();
