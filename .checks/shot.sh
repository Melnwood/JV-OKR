#!/bin/zsh
# capture one app state headlessly.  usage: shot.sh "<query>" out.png [w] [h]
Q="$1"; OUT="$2"; W="${3:-1200}"; H="${4:-900}"
F="file:///Users/melvinellenwood/Desktop/mels%20stuff/Projects/jv-okr/index.html"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=$W,$H --virtual-time-budget=4000 \
  --screenshot="$OUT" "$F?$Q" >/dev/null 2>&1
