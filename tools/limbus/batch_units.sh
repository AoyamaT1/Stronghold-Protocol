#!/bin/bash
# 批量用 clips 管线重刷 12 罪人的 Spine
cd "D:/build/Stronghold-Protocol-4PR"
API=http://127.0.0.1:47821
declare -A IDS=(
 [yisang]=10104 [faust]=10212 [donquixote]=10310 [ryoshu]=10415
 [meursault]=10512 [honglu]=10613 [heathcliff]=10710 [ishmael]=10808
 [rodion]=10913 [sinclair]=11005 [outis]=11107 [gregor]=11216
)
for n in yisang faust donquixote ryoshu meursault honglu heathcliff ishmael rodion sinclair outis gregor; do
  echo "===== $n (id=${IDS[$n]}) ====="
  python tools/limbus/make_unit_clips.py --id "${IDS[$n]}" --char "char_limbus_$n" \
      --api "$API" --mod mods/limbus-company 2>&1 | tail -6
done
echo "ALL DONE"
