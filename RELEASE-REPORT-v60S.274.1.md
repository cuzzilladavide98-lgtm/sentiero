# Sentiero v60S.274.1 — rapporto di rilascio

Baseline: v60S.274.0. Ambito esclusivo: Giornale.

## Esito

Il Giornale passa da un registro di sei fonti a 26 feed pubblici gratuiti e autorevoli: 11 fonti primarie o istituzionali e 15 redazioni indipendenti o di servizio pubblico, in quattro lingue. La raccolta resta chiusa e SSRF-safe, con link-domain allowlist, corpi e timeout limitati e provenienza completa per evidenza.

Il motore ora raggruppa lo stesso fatto tra lingue, valida semanticamente claim, numeri, negazioni e incertezza, misura la corroborazione senza confondere la ripetizione di un comunicato con una verifica indipendente e conserva 14 giorni di memoria per distinguere sviluppi, correzioni, ritorni e ripetizioni. La selezione non ha minimi artificiali: importanza pubblica, conseguenze, novità reale e solidità dell’evidenza governano una prima pagina da una a sei storie.

Il prompt editoriale è stato riscritto come contratto di prosa e verità; un Editorial Critic avversariale ricompone sempre la bozza prima del gate deterministico. Il fallback senza Gemini pubblica soltanto materiale supportato sopra soglia, con gerarchia e provenienza, oppure dichiara onestamente che non esiste un’edizione affidabile. L’ultima edizione resta disponibile offline.

## Evidenza

- contratti semantici e redazionali: PASS;
- 26/26 fonti raggiungibili e 23/26 con elementi recenti parseabili al controllo live;
- Chrome 375 e 1024 px: una sola storia degna produce una sola lead, con citazioni, provenienza, fine dell’edizione, nessun overflow o errore console;
- Worker/D1 locale E2E e bundle Wrangler dry-run: PASS;
- regressione applicativa completa: PASS.

Cloudflare remoto e QA fisico restano deliberatamente rinviati, come richiesto. Non sono necessari per usare l’ultima edizione offline o per verificare la qualità della candidata locale.
