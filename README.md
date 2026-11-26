# PokerZone

## Prywatny stół online

W oknie **Nowa gra** wybierz **Graj online**. Wpisz nick, wybierz stawkę i kliknij **Utwórz stół**. Skopiuj zaproszenie i wyślij je drugiemu graczowi. Po otwarciu linku drugi gracz wpisuje nick i klika **Dołącz**. Każdy zaczyna ze 100 BB w żetonach treningowych.

Po odświeżeniu strony PokerZone spróbuje przywrócić miejsce w tej samej karcie przeglądarki. Gdy któryś z graczy utraci połączenie, rozdanie czeka na jego powrót. Niepełny stół wygasa po 30 minutach. Stoły są przechowywane w pamięci procesu, więc restart serwera kończy bieżące rozgrywki online.

### Uruchomienie lokalne

```sh
npm --prefix server ci
npm --prefix server start
```

Otwórz `http://127.0.0.1:8080` w przeglądarce i wybierz **Graj online → Utwórz stół**. Ustaw stawkę, liczbę osób (wliczając gospodarza) i liczbę botów. Stół ma od 2 do 8 miejsc łącznie, a gra rusza, gdy zasiądzie co najmniej dwóch uczestników. Kod jest dostępny pod przyciskiem **Zaproś**. Goście wpisują go w **Dołącz kodem** lub otwierają link zaproszenia i wybierają wolne miejsce. Do trwającej gry wchodzą od kolejnego rozdania i wpłacają wejściowy big blind. Testy można uruchomić przez `npm --prefix server test`.

### Udostępnienie przez internet

Gra online wymaga publicznego serwera PokerZone. GitHub Pages publikuje stronę, a osobny proces Node.js obsługuje stoły i połączenia WebSocket. [Dokumentacja GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

1. W Render wybierz **New → Blueprint** i połącz repozytorium zawierające `render.yaml`. Konfiguracja uruchamia pojedynczy proces PokerZone na planie Free. [Wdrażanie Blueprintów](https://render.com/docs/infrastructure-as-code)
2. Gdy wdrożenie będzie gotowe, otwórz adres HTTPS usługi Render. Strona gry dostępna pod tym adresem automatycznie używa serwera z tej samej domeny. Na bezpłatnym planie pierwsze otwarcie po okresie bezczynności może potrwać około minuty. [WebSocket na Render](https://render.com/docs/websocket) · [Usypianie na planie Free](https://render.com/docs/free#spinning-down-on-idle)
3. Wersja na GitHub Pages łączy się automatycznie z `wss://pokerzone-online.onrender.com/ws`. Jeśli przeniesiesz serwer, zaktualizuj wartość znacznika `pokerzone-online-url` w `index.html`. Link zaproszenia zawiera kod stołu.

Na innym hostingu ustaw `HOST=0.0.0.0` i port przez zmienną `PORT`. Zainstaluj zależności poleceniem `npm --prefix server ci`, a proces uruchom przez `npm --prefix server start`. Kontrola dostępności działa pod `/health`, a gra pod `/ws`. Użyj jednej instancji procesu, bo pokoje są przechowywane w jej pamięci.

Opcjonalna zmienna `POKERZONE_ORIGINS` przyjmuje rozdzielone przecinkami adresy stron, które mogą się łączyć. Jeśli używasz zarówno GitHub Pages, jak i strony z serwera gry, wpisz obie domeny z prefiksem `https://`.
