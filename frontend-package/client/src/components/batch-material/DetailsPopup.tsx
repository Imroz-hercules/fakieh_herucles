import React from 'react';
import PieChart from './PieChart';
import { X } from 'lucide-react';

interface DetailsPopupProps {
  date: string;
  data: any[];
  onClose: () => void;
  totalProduction: number;
  totalBatches: number;
  totalProducts: number;
}

const DetailsPopup: React.FC<DetailsPopupProps> = ({ date, data, onClose, totalProduction, totalBatches, totalProducts }) => {
  if (!data || data.length === 0) {
    return null;
  }

  // Direct hex color values for consistent theming (same as dashboard)
  const uniqueColors = [
    '#FF6B6B',  // Coral Red
    '#4ECDC4',  // Turquoise
    '#45B7D1',  // Sky Blue
    '#96CEB4',  // Mint Green
    '#FFEAA7',  // Cream Yellow
    '#DDA0DD',  // Plum
    '#98D8C8',  // Sea Green
    '#F7DC6F',  // Golden Yellow
    '#BB8FCE',  // Lavender
    '#85C1E9',  // Light Blue
    '#F8C471',  // Sandy Orange
    '#82E0AA',  // Light Green
    '#F1948A',  // Light Coral
    '#D7BDE2',  // Light Purple
    '#A9DFBF',  // Light Mint
    '#FAD7A0',  // Peach
    '#D5A6BD',  // Dusty Rose
    '#A3E4D7',  // Aqua
    '#F9E79F',  // Light Gold
    '#D2B4DE',  // Light Lavender
  ];

  // Get colors for each product, cycling through the unique colors
  const getProductColors = (productCount: number) => {
    const colors = [];
    for (let i = 0; i < productCount; i++) {
      const colorIndex = i % uniqueColors.length;
      colors.push(uniqueColors[colorIndex]);
    }
    return colors;
  };

  const productColors = getProductColors(data.length);

  const chartData = {
    labels: data.map(item => item.product_name),
    datasets: [
      {
        data: data.map(item => item.quantity_kg),
        backgroundColor: productColors,
        borderColor: productColors,
        borderWidth: 2,
        hoverBorderWidth: 3,
        hoverBorderColor: productColors,
      },
    ],
  };

  return (
    <div className="fixed inset-0 bg-white/30 dark:bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg shadow-2xl w-full max-w-4xl p-6 relative border border-slate-300 dark:border-slate-700">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <h2 className="text-2xl font-bold mb-4 text-blue-600 dark:text-cyan-300">
          {new Date(date).toLocaleDateString()} - Details
        </h2>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-center">
          <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg border border-slate-300 dark:border-slate-700">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Production</h3>
            <p className="text-2xl font-bold text-blue-600 dark:text-cyan-400">
              {(totalProduction / 1000).toFixed(2)}{' '}
              <span className="text-base font-normal">tons</span>
            </p>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg border border-slate-300 dark:border-slate-700">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Batches</h3>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{totalBatches}</p>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg border border-slate-300 dark:border-slate-700">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Products</h3>
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{totalProducts}</p>
          </div>
        </div>

        {/* Table + Chart */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Table */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-blue-600 dark:text-cyan-300">Product Totals</h3>
            <div className="overflow-auto max-h-80 border border-slate-300 dark:border-slate-700 rounded-lg">
              <table className="w-full text-sm text-left">
                <thead className="reporting-table-head bg-gradient-to-r from-cyan-600 to-cyan-700 text-white sticky top-0 shadow-sm">
                  <tr>
                    <th className="px-6 py-3 border border-cyan-800/40 font-semibold text-white">Product Name</th>
                    <th className="px-6 py-3 text-right border border-cyan-800/40 font-semibold text-white">Quantity (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, index) => (
                    <tr
                      key={index}
                      className="border-b border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800/60"
                    >
                      <td className="px-6 py-4 font-medium whitespace-nowrap flex items-center gap-2 text-slate-900 dark:text-white">
                        {/* Color indicator matching the chart */}
                        <div
                          className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600"
                          style={{ backgroundColor: productColors[index] }}
                        />
                        <span>{item.product_name}</span>
                      </td>
                      <td className="px-6 py-4 text-right text-slate-900 dark:text-white">
                        {item.quantity_kg.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chart */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-center text-blue-600 dark:text-cyan-300">
              Product Pie Chart
            </h3>
            <div className="flex justify-center items-center h-full max-h-80 details-popup-pie-chart">
              <PieChart data={chartData} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailsPopup;
