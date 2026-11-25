# PokerZone

## Prywatny stół online

W oknie **Nowa gra** wybierz **Graj online**. Wpisz nick, wybierz stawkę i kliknij **Utwórz stół**. Skopiuj zaproszenie i wyślij je drugiemu graczowi. Po otwarciu linku drugi gracz wpisuje nick i klika **Dołącz**. Każdy zaczyna ze 100 BB w żetonach treningowych.

Po odświeżeniu strony PokerZone spróbuje przywrócić miejsce w tej samej karcie przeglądarki. Gdy któryś z graczy utraci połączenie, rozdanie czeka na jego powrót. Niepełny stół wygasa po 30 minutach. Stoły są przechowywane w pamięci procesu, więc restart serwera kończy bieżące rozgrywki online.

### Uruchomienie lokalne

```sh
npm --prefix server ci
npm --prefix server start
```

Otwórz `http://127.0.0.1:8080` w dwóch niezależnych kartach przeglądarki. Kod zaproszenia i adres serwera uzupełniają się z linku. Test protokołu można uruchomić przez `npm --prefix server test`.

### Udostępnienie przez internet

GitHub Pages może serwować stronę gry. Proces Node.js obsługujący stoły uruchom na hostingu obsługującym WebSocket i HTTPS. [Dokumentacja GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

- Ustaw `HOST=0.0.0.0` i port zgodny z ustawieniami hostingu. Proces korzysta ze zmiennej `PORT`.
- Wdrożenie instaluje zależności poleceniem `npm --prefix server ci` i uruchamia `npm --prefix server start`. Endpoint do kontroli dostępności to `/health`, a do gry `/ws`.
- Jeśli strona nadal korzysta z GitHub Pages, wpisz publiczny adres `wss://…/ws` w polu **Adres serwera** lub ustaw go w znaczniku `pokerzone-online-url` w `index.html`. Link zaproszenia zawiera ten adres.
- Opcjonalna zmienna `POKERZONE_ORIGINS` przyjmuje rozdzielone przecinkami źródła stron mogących się łączyć, np. `https://wojciechnosalgit.github.io`. Uruchom jedną instancję procesu, aby obaj gracze trafiali do tego samego pokoju.
