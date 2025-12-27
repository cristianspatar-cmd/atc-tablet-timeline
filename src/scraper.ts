import * as https from 'https';

const url = 'https://flightplan.romatsa.ro/init/fpl/flightslr/LRSV';

/**
 * Acest script descarcă datele de zbor de la ROMATSA pentru LRSV.
 *
 * NOTĂ:
 * Scriptul parsează o versiune TEXT a paginii, așa cum a fost furnizată.
 * Această metodă este fragilă și depinde de formatarea textului.
 */
function fetchAndParseFlights() {
  https.get(url, (res) => {
    let rawData = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      rawData += chunk;
    });
    res.on('end', () => {
      try {
        const { arrivals, departures } = parseInputText(rawData);

        console.log('--- SOSIRI (ARR) ---');
        if (arrivals.length) {
          console.table(arrivals);
        } else {
          console.log('Nu s-au găsit date pentru sosiri.');
        }

        console.log('\n--- PLECĂRI (DEP) ---');
        if (departures.length) {
          console.table(departures);
        } else {
          console.log('Nu s-au găsit date pentru plecări.');
        }

      } catch (error) {
        console.error('A apărut o eroare la parsarea datelor:', error);
      }
    });
  }).on('error', (err) => {
    console.error('Eroare la accesarea URL-ului:', err.message);
  });
}

function parseInputText(fullText: string): { arrivals: Record<string, string>[], departures: Record<string, string>[] } {
    const lines = fullText.split('\n').map(line => line.trim()).filter(Boolean);

    let arrivals: Record<string, string>[] = [];
    let departures: Record<string, string>[] = [];

    let currentSection: 'none' | 'arrivals' | 'departures' = 'none';
    let arrivalHeaderFound = false;
    let departureHeaderFound = false;

    const arrivalHeadersPattern = /^ARCID\s+FROM\s+EOBT\s+TTL\s+ETA\s+TYPE\s+REG$/;
    const departureHeadersPattern = /^ARCID\s+DEST\s+EOBT\s+ETD\s+TYPE\s+REG$/;

    let arrivalLines: string[] = [];
    let departureLines: string[] = [];

    for (const line of lines) {
        if (arrivalHeadersPattern.test(line)) {
            currentSection = 'arrivals';
            arrivalHeaderFound = true;
            continue;
        }
        if (departureHeadersPattern.test(line)) {
            currentSection = 'departures';
            departureHeaderFound = true;
            continue;
        }
        if (line.startsWith('TOTAL:')) {
            currentSection = 'none';
            continue;
        }

        if (currentSection === 'arrivals' && arrivalHeaderFound) {
            arrivalLines.push(line);
        } else if (currentSection === 'departures' && departureHeaderFound) {
            departureLines.push(line);
        }
    }

    arrivals = parseSection(arrivalLines, true);
    departures = parseSection(departureLines, false);

    return { arrivals, departures };
}

function parseSection(sectionLines: string[], isArrival: boolean): Record<string, string>[] {
    const flights: Record<string, string>[] = [];

    sectionLines.forEach(line => {
        // Excludem linia DESS* LRSV ... care este o subtitra
        if (line.startsWith('DESS*')) return;

        const values = line.split(/\s+/).filter(Boolean);
        const flight: Record<string, string> = {};

        if (isArrival && values.length >= 7) {
            flight['ARCID'] = values[0] || '';
            flight['FROM'] = values[1] || '';
            flight['EOBT'] = values[2] || '';
            flight['TTL'] = values[3] || '';
            flight['ETA'] = `${values[4]} ${values[5]}`; // Combine date and time
            flight['TYPE'] = values[6] || '';
            flight['REG'] = values[7] || '';
            flights.push(flight);
        } else if (!isArrival && values.length >= 6) {
            flight['ARCID'] = values[0] || '';
            flight['DEST'] = values[1] || '';
            flight['EOBT'] = values[2] || '';
            flight['ETD'] = values[3] || '';
            flight['TYPE'] = values[4] || '';
            flight['REG'] = values[5] || '';
            flights.push(flight);
        }
    });

    return flights;
}

// Pornim procesul
fetchAndParseFlights();
