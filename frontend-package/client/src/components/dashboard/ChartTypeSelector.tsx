// ChartComponent.tsx
import React from "react"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  RadialLinearScale,
} from "chart.js"
import {
  Line,
  Bar,
  Pie,
  Doughnut,
  PolarArea,
  Radar,
  Scatter,
} from "react-chartjs-2"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,          // pie + doughnut
  RadialLinearScale,   // polar area + radar
  Title,
  Tooltip,
  Legend
)

interface ChartComponentProps {
  type:
    | "line"
    | "bar"
    | "area"
    | "pie"
    | "doughnut"
    | "polarArea"
    | "radar"
    | "scatter"
  data: any
}

export function ChartComponent({ type, data }: ChartComponentProps) {
  switch (type) {
    case "line":
      return <Line data={data} />

    case "area":
      return (
        <Line
          data={{
            ...data,
            datasets: data.datasets.map((ds: any) => ({
              ...ds,
              fill: true, // makes it an area chart
            })),
          }}
        />
      )

    case "bar":
      return <Bar data={data} />

    case "pie":
      return <Pie data={data} />

    case "doughnut":
      return <Doughnut data={data} />

    case "polarArea":
      return <PolarArea data={data} />

    case "radar":
      return <Radar data={data} />

    case "scatter":
      return <Scatter data={data} />

    default:
      return <Line data={data} />
  }
}
