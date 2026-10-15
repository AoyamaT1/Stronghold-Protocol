#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_garrisons.py — 给 12 罪人各设计一个独特的「特质」，替换掉原先 12 人一模一样的
`<获得时>【边狱公司】层数+2`。

设计原则（对照官方核心盟约成员的特质语汇：data/garrisons.json 里 炎/萨尔贡/维多利亚/谢拉格/拉特兰）：
  * 触发标签只用官方那套：`<获得时>` `<休整期结束时>` `<战斗中>` `<刷新时>`，或无条件被动
  * 效果只用引擎已支持的 effectKey（bb / bbStr 的字段照抄现有样例）
  * 每个人一条，贴合其剧情与人格机制；精锐版数值更强

用法: python tools/limbus/build_garrisons.py
"""
import json, sys, os
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

OUT = "mods/limbus-company/data/garrisons.json"
BOND = "limbusShip"
CORE_BONDS = "yanShip,kjeragShip,sargonShip,lateranoShip,victoriaShip,egirShip,kazimierzShip,siracusaShip," + BOND
ATTR = "act1autochess_gar_eff_attrByBond"

# 罪人 → (特质描述, effectKey, eventType, bb, bbStr)   精锐版另给
DESIGN = {
 # 1. 李箱 —— 最弱，却能从镜中照见「更好的可能性」：起步层数随调度中心等级水涨船高
 "yisang": ("爱之镜", "SERVER_ADD_BOND_METHOD", "SERVER_GAIN",
            {"multi": 1}, {"add_method": "shoplv", "bond": BOND},
            {"multi": 2}, {"add_method": "shoplv", "bond": BOND}),

 # 2. 浮士德 —— 博识与算计：直接换来资金
 "faust": ("万全的计算", "SERVER_ONCE_GOLD", "SERVER_GAIN",
           {"count": 2}, {}, {"count": 4}, {}),

 # 3. 辛克莱 —— 以理智换力量：盟约层数越高越强
 "sinclair": ("执柄者的代价", ATTR, "IN_BATTLE",
              {"divide_num": 3, "atk": 0.01}, {"key": ATTR, "bond_id": BOND},
              {"divide_num": 3, "atk": 0.02}, {"key": ATTR, "bond_id": BOND}),

 # 4. 罗佳 —— 贪取：一次性攫取大量层数
 "rodion": ("索求无度", "SERVER_ADD_BOND", "SERVER_GAIN",
            {"count": 5}, {"bond": BOND}, {"count": 10}, {"bond": BOND}),

 # 5. 以实玛利 —— 船长：随击杀指挥全船
 "ishmael": ("裴廓德号的号令", "act1autochess_gar_event_selfkillenemy", "IN_BATTLE",
             {"check_cnt": 2, "bond_add_count": 1},
             {"key": "act1autochess_gar_event_selfkillenemy", "bond_type": "bond_by_id", "bond_id": BOND, "bond_add_type": "by_count"},
             {"check_cnt": 1, "bond_add_count": 1},
             {"key": "act1autochess_gar_event_selfkillenemy", "bond_type": "bond_by_id", "bond_id": BOND, "bond_add_type": "by_count"}),

 # 6. 希斯克利夫 —— 第一个冲上去的人：首次开技能就是爆发
 "heathcliff": ("呼啸山庄的狂猎", "act1autochess_gar_event_useskill", "IN_BATTLE",
                {"bond_add_count": 5, "max_add_count_per_battle": 5},
                {"key": "act1autochess_gar_event_useskill", "bond_type": "bond_by_id", "bond_id": BOND, "bond_add_type": "by_count", "garrison_key": "garrison_limbus_heathcliff_a"},
                {"bond_add_count": 8, "max_add_count_per_battle": 8},
                {"key": "act1autochess_gar_event_useskill", "bond_type": "bond_by_id", "bond_id": BOND, "bond_add_type": "by_count", "garrison_key": "garrison_limbus_heathcliff_b"}),

 # 7. 堂吉诃德 —— 血族之主：所属盟约全部受益
 "donquixote": ("拉·曼却领的眷属", "SERVER_ADD_BOND_CHESS_ALL", "SERVER_GAIN",
                {"count": 3}, {}, {"count": 5}, {}),

 # 8. 鸿璐 —— 君主：全面强化，且随核心盟约成长
 "honglu": ("鸿园的君主", ATTR, "IN_BATTLE",
            {"divide_num": 3, "atk": 0.01, "max_hp": 0.01}, {"key": ATTR, "bond_id": BOND},
            {"divide_num": 3, "atk": 0.02, "max_hp": 0.02}, {"key": ATTR, "bond_id": BOND}),

 # 9. 良秀 —— 以「重画」为业：刷新即重绘，层数随之累积
 "ryoshu": ("拙劣的习作", "SERVER_GAIN_BOND_LAYER_BY_REFRESH_CNT", "SERVER_REFRESH_SHOP",
            {"refresh_cnt": 1, "layer": 4}, {"bond": BOND},
            {"refresh_cnt": 1, "layer": 6}, {"bond": BOND}),

 # 10. 默尔索 —— 拇指的军令：弹药换战果
 "meursault": ("军令如山", "act1autochess_gar_event_consume_ammo", "IN_BATTLE",
               {"at_root": 1, "consume_count": 6, "bond_add_count": 1},
               {"key": "act1autochess_gar_event_consume_ammo", "bond_id": BOND, "bond_type": "bond_by_id", "bond_add_type": "by_count", "range_id": "x-5"},
               {"at_root": 1, "consume_count": 4, "bond_add_count": 1},
               {"key": "act1autochess_gar_event_consume_ammo", "bond_id": BOND, "bond_type": "bond_by_id", "bond_add_type": "by_count", "range_id": "x-5"}),

 # 11. 奥提斯 —— 魔弹射手：赌徒的第七发
 "outis": ("第七发魔弹", "SERVER_GAIN_FREE_REFRESH_COUNT", "SERVER_GAIN",
           {"count": 1}, {}, {"count": 2}, {}),

 # 12. 格里高尔 —— 黎明将启：休整期结束让最强的盟约更进一步
 "gregor": ("黎明将至", "SERVER_ADD_BOND_ACTIVATED_MOST_LAYER", "SERVER_PREP_FIN",
            {"count": 2}, {}, {"count": 4}, {}),
}


def gun(desc, bb, bbStr):
    return {"desc": desc, "descRaw": desc, "bb": bb, "bbStr": bbStr}


def main():
    out = {}
    for name, (title, ek, ev, bb, bs, gbb, gbs) in DESIGN.items():
        base = f"garrison_limbus_{name}"
        # 普通
        out[f"{base}_a"] = {
            "garrisonId": f"{base}_a", "eventType": ev, "effectType": ek, "effectKey": ek,
            "desc": f"<{ {'SERVER_GAIN':'获得时','SERVER_PREP_FIN':'休整期结束时','SERVER_REFRESH_SHOP':'刷新时','IN_BATTLE':'战斗中'}[ev] }>{title}：{ ''
                }".replace("：", "") + "", "bb": bb, "bbStr": bs,
        }
        # 精锐
        out[f"{base}_b"] = dict(out[f"{base}_a"], garrisonId=f"{base}_b", bb=gbb, bbStr=gbs)

    # 上面那行拼接太绕，重写 desc
    TAG = {"SERVER_GAIN": "获得时", "SERVER_PREP_FIN": "休整期结束时",
           "SERVER_REFRESH_SHOP": "刷新时", "IN_BATTLE": "战斗中"}
    DESC = {
        "yisang": "<获得时>获得等于当前调度中心等级的【边狱公司】层数（无需激活盟约）",
        "faust": "<获得时>使下个休整期额外获得 {n} 资金",
        "sinclair": "【边狱公司】每叠加 3 层，本干员攻击力 +{p}%",
        "rodion": "<获得时>【边狱公司】层数 +{n}（无需激活盟约）",
        "ishmael": "<战斗中>每击倒 {n} 名单位时，使已激活的【边狱公司】层数 +1",
        "heathcliff": "<战斗中>首次开启技能时，使已激活的【边狱公司】层数 +{n}",
        "donquixote": "<获得时>自身所属盟约层数 +{n}（无需激活盟约）",
        "honglu": "攻击力和生命值 +20%；【边狱公司】每叠加 3 层，本干员攻击力和生命值 +{p}%",
        "ryoshu": "<刷新时>若为本回合首次主动刷新，使已激活的【边狱公司】层数 +{n}",
        "meursault": "<战斗中>自身周围 4 格的干员每消耗 {n} 发弹药，使已激活的【边狱公司】层数 +1",
        "outis": "<获得时>获得 {n} 次免费刷新",
        "gregor": "<休整期结束时>当前激活且层数最多的盟约层数 +{n}，此干员在整备区时也有效",
    }
    NUM = {  # 每人 (普通值, 精锐值) —— 用于 desc 的 {n} 或 {p}
        "yisang": (0, 0), "faust": (2, 4), "sinclair": (1, 2), "rodion": (5, 10),
        "ishmael": (2, 1), "heathcliff": (5, 8), "donquixote": (3, 5), "honglu": (1, 2),
        "ryoshu": (4, 6), "meursault": (6, 4), "outis": (1, 2), "gregor": (2, 4),
    }
    for name in DESIGN:
        for sfx, i in (("_a", 0), ("_b", 1)):
            v = NUM[name][i]
            v = v if isinstance(v, int) else v
            d = DESC[name].replace("{n}", str(v)).replace("{p}", str(v))
            out[f"garrison_limbus_{name}{sfx}"]["desc"] = d
            out[f"garrison_limbus_{name}{sfx}"]["descRaw"] = d
            out[f"garrison_limbus_{name}{sfx}"]["effectKey"] = DESIGN[name][1]
            out[f"garrison_limbus_{name}{sfx}"]["effectType"] = DESIGN[name][1]

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"写出 {len(out)} 条特质 → {OUT}")
    for name, (title, ek, ev, *_rest) in DESIGN.items():
        print(f"  {name:<11} [{ek}]  {out[f'garrison_limbus_{name}_a']['desc']}")


if __name__ == "__main__":
    main()
