# Local Ollama

Obelus talks to a local Ollama daemon at `http://localhost:11434/v1`. Ollama refuses any origin it has
not been told to allow, and answers the browser's preflight with `403 Forbidden`; Obelus reports that
as "Failed to fetch". Add the app's origin to `OLLAMA_ORIGINS` before starting the daemon.

## macOS — Ollama app

```sh
launchctl setenv OLLAMA_ORIGINS "http://localhost:5173,https://obelus.kiranbrahma.com,https://writing-tool.kiranbrahma.workers.dev"
```

Quit Ollama from the menu bar and open it again. If it will not quit, run `pkill -x Ollama` and reopen
it. `launchctl setenv` lasts until the next restart; run it again after a restart. Putting it in
`~/.zshrc` does not help, because the Ollama app does not read your shell profile.

## macOS or Linux — `ollama serve`

```sh
OLLAMA_ORIGINS=http://localhost:5173 ollama serve
```

Add deployed origins separated by commas.

## Windows

```sh
setx OLLAMA_ORIGINS "https://obelus.kiranbrahma.com"
```

Quit Ollama from the taskbar and open it again.

## Linux — systemd

```sh
sudo systemctl edit ollama.service
```

Add under `[Service]`:

```ini
Environment="OLLAMA_ORIGINS=https://obelus.kiranbrahma.com"
```

Then `sudo systemctl restart ollama`. If `OLLAMA_ORIGINS` is already set, append the address with a
comma.

## Check it

```sh
curl -i -X OPTIONS http://localhost:11434/v1/chat/completions \
  -H "Origin: https://obelus.kiranbrahma.com" \
  -H "Access-Control-Request-Method: POST"
```

Look for `204` and an `Access-Control-Allow-Origin` header naming your origin. Chrome may ask for
permission to reach devices on your local network the first time; allow it.

## Ollama Cloud

Ollama Cloud models work through the local daemon. Run `ollama signin` once, then enter a cloud model
id such as `glm-5.3:cloud` in the Ollama Connection; `ollama list` shows the ones you have. The daemon
forwards the request with your account, so no key enters the browser. Calling `https://ollama.com`
directly from the browser does not work: it does not answer CORS preflight, and a proxy would break
the browser-only privacy claim.
