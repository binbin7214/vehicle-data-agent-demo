from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Literal

app = FastAPI(title="车辆数据看板 Mock API", version="0.1.0")

# 允许前端开发服务器跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- 请求模型 ----------
class DataRequest(BaseModel):
    carModel: Literal["全部车型", "车型A", "车型B"] = Field(default="全部车型")
    dateRange: Literal["上周", "上月", "上季度"] = Field(default="上周")
    granularity: Literal["按天", "按周", "按月"] = Field(default="按天")


# ---------- mock 数据生成 ----------
def seeded_random(seed: int):
    """简单的线性同余伪随机，保证同一参数组合下数据稳定"""
    s = seed % 2147483647
    if s <= 0:
        s += 2147483646

    def rand() -> float:
        nonlocal s
        s = (s * 16807) % 2147483647
        return (s - 1) / 2147483646

    return rand


def str_hash(text: str) -> int:
    h = 0
    for ch in text:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h if h < 0x80000000 else h - 0x100000000


# 每个时间周期对应的数据点数量
PERIOD_POINT_COUNT = {
    "上周": 7,
    "上月": 30,
    "上季度": 90,
}

# 每个统计颗粒度对应的抽样步长
GRANULARITY_STEP = {
    "按天": 1,
    "按周": 7,
    "按月": 30,
}

# 不同车型的基准销量
MODEL_BASE = {
    "全部车型": 520,
    "车型A": 680,
    "车型B": 410,
}


def build_mock_data(car_model: str, date_range: str, granularity: str) -> dict:
    point_count = PERIOD_POINT_COUNT[date_range]
    step = GRANULARITY_STEP[granularity]
    rand = seeded_random(str_hash(f"{car_model}-{date_range}-{granularity}"))
    base = MODEL_BASE[car_model]

    categories: List[str] = []
    values: List[int] = []
    for i in range(point_count):
        # 按天显示全部数据点，按周/按月做抽样避免 x 轴过密
        is_boundary = granularity == "按天" or (i + 1) % step == 0 or i == point_count - 1
        if not is_boundary:
            continue
        if granularity == "按月":
            categories.append(f"第{i // 30 + 1}月")
        else:
            categories.append(f"D{i + 1}")
        values.append(round(base * (0.6 + rand() * 0.8)))

    granularity_label = {"按天": "按天", "按周": "按周", "按月": "按月"}[granularity]
    title = f"{date_range}·{car_model}销量趋势（{granularity_label}）"

    return {"categories": categories, "values": values, "title": title}


# ---------- 接口 ----------
@app.post("/api/data")
def get_data(req: DataRequest):
    return build_mock_data(req.carModel, req.dateRange, req.granularity)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
