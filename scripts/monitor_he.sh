#!/bin/bash
LOG_DIR="/var/log/nginx"
TODAY=$(date +%d/%b/%Y)
THRESHOLD=20
NETWORK="65.49.1.0/24"
LOG_FILE="/var/log/he_monitor.log"

count_requests() {
    local count=0
    for f in "$LOG_DIR/access.log" "$LOG_DIR/my-space-access.log"; do
        if [ -f "$f" ]; then
            c=$(sudo awk -v net="65.49.1." -v today="$TODAY" '
                $0 ~ net && $0 ~ today {count++} 
                END {print count+0}
            ' "$f")
            count=$((count + c))
        fi
    done
    echo "$count"
}

is_blocked() {
    sudo ufw status | grep -q "$NETWORK" && echo "yes" || echo "no"
}

get_ips() {
    for f in "$LOG_DIR/access.log" "$LOG_DIR/my-space-access.log"; do
        if [ -f "$f" ]; then
            sudo awk -v net="65.49.1." -v today="$TODAY" '
                $0 ~ net && $0 ~ today {print $1}
            ' "$f" | sort -u
        fi
    done | sort -u | tr '\n' ' '
}

echo "[$(date '+%Y-%m-%d %H:%M:%S')] === HE Monitor ===" | tee -a "$LOG_FILE"
COUNT=$(count_requests)
BLOCKED=$(is_blocked)
IPS=$(get_ips)
echo "  Requests: $COUNT (threshold: $THRESHOLD)" | tee -a "$LOG_FILE"
echo "  Unique IPs: $IPS" | tee -a "$LOG_FILE"
echo "  Blocked: $BLOCKED" | tee -a "$LOG_FILE"

if [ "$BLOCKED" = "yes" ]; then
    echo "  Already blocked, skip" | tee -a "$LOG_FILE"
elif [ "$COUNT" -ge "$THRESHOLD" ]; then
    echo "  THRESHOLD EXCEEDED! Blocking $NETWORK" | tee -a "$LOG_FILE"
    sudo ufw insert 1 deny from "$NETWORK" to any comment "Auto-block-HE-$(date +%Y%m%d)"
    echo "  Blocked" | tee -a "$LOG_FILE"
else
    echo "  Below threshold, monitoring" | tee -a "$LOG_FILE"
fi
