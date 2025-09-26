'use client';

import axios from 'axios';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Bar, BarChart, Brush, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface User {
  id: string;
  name: string;
  email: string;
}

interface Transaction {
  id: string;
  amount: number;
  createdAt: string;
  currency: string;
  from: {
    number: string;
    user: {
      name: string;
      id: string;
    };
  };
  to: {
    number: string;
    user: {
      name: string;
      id: string;
    };
  };
}

interface BankAccount {
  id: string;
  number: string;
  balance: number;
  currency: string;
  user: {
    name: string;
    id: string;
  };
}

const COLORS = ['#4F46E5', '#10B981'];

type SortField = 'date' | 'amount' | 'from' | 'to';
type SortOrder = 'asc' | 'desc';

export default function HomePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Load token from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('czechibank_api_key');
    if (savedToken) {
      setToken(savedToken);
      fetchData(savedToken);
    } else {
      setInitialLoading(false);
    }
  }, []);

  const fetchData = async (authToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const headers = { 'x-api-key': authToken };
      const baseUrl = 'https://czechibank.ostrava.digital/api/v1';
      const [transactionsRes, accountsRes, userRes] = await Promise.all([
        axios.get(`${baseUrl}/transactions?limit=1000`, { withCredentials: false, headers }),
        axios.get(`${baseUrl}/bank-account`, { withCredentials: false, headers }),
        axios.get(`${baseUrl}/user`, { withCredentials: false, headers }),
      ]);
      
      setTransactions(transactionsRes.data.data.transactions);
      setAccounts(accountsRes.data.data.bankAccounts);
      setCurrentUser(userRes.data.data);

      setIsAuthenticated(true);
      localStorage.setItem('czechibank_api_key', authToken);
    } catch (error) {
      console.error('Error fetching data:', error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          setError('Authentication failed. Please check your API key and try again.');
          localStorage.removeItem('czechibank_api_key');
        } else if (error.response?.status === 404) {
          setError('API endpoint not found. Please verify the API server is running and the endpoints are correct.');
        } else if (error.code === 'ECONNREFUSED') {
          setError('Could not connect to the API server. Please make sure it is running at http://localhost:3000');
        } else {
          setError(`Failed to fetch data: ${error.message}`);
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  // Process data for charts
  const balanceData = transactions
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .reduce((acc: { date: string; balance: number }[], tx) => {
      const lastBalance = acc.length > 0 ? acc[acc.length - 1].balance : 0;
      // Check if the current user is receiving money based on user ID
      const isIncomingTransaction = tx.to.user.id === currentUser?.id;
      const transactionAmount = isIncomingTransaction ? Math.abs(tx.amount) : -Math.abs(tx.amount);
      const newBalance = lastBalance + transactionAmount;
      const date = new Date(tx.createdAt).toLocaleString('cs-CZ', {
        month: 'numeric',
        day: 'numeric'
      });
      
      // If we already have an entry for this date, update it
      const existingDateIndex = acc.findIndex(item => item.date === date);
      if (existingDateIndex !== -1) {
        acc[existingDateIndex].balance = newBalance;
        return acc;
      }
      
      return [...acc, { date, balance: newBalance, transactionAmount }];
    }, []);

  const monthlyData = transactions.reduce((acc: any, tx) => {
    const month = new Date(tx.createdAt).toLocaleString('default', { month: 'long' });
    const isIncomingTransaction = tx.to.user.id === currentUser?.id;
    const amount = Math.abs(tx.amount);
    
    if (!acc[month]) {
      acc[month] = { month, incoming: 0, outgoing: 0 };
    }
    
    if (isIncomingTransaction) {
      acc[month].incoming += amount;
    } else {
      acc[month].outgoing -= amount; // Make outgoing negative
    }
    
    return acc;
  }, {});

  const monthlyChartData = Object.values(monthlyData);

  const transactionTypes = transactions.reduce((acc: { Income: number; Expense: number }, tx) => {
    const isIncomingTransaction = tx.to.user.id === currentUser?.id;
    const amount = Math.abs(tx.amount);
    
    if (isIncomingTransaction) {
      acc.Income = (acc.Income || 0) + amount;
    } else {
      acc.Expense = (acc.Expense || 0) + amount;
    }
    
    return acc;
  }, { Income: 0, Expense: 0 });

  const transactionStats = {
    totalTransactions: transactions.length,
    totalVolume: transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
    averageAmount: transactions.length > 0 
      ? Math.round(transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0) / transactions.length)
      : 0,
    largestTransaction: transactions.length > 0
      ? Math.max(...transactions.map(tx => Math.abs(tx.amount)))
      : 0,
    smallestTransaction: transactions.length > 0
      ? Math.min(...transactions.map(tx => Math.abs(tx.amount)))
      : 0,
  };

  const topPartners = transactions.reduce((acc: { [key: string]: { name: string, incoming: number, outgoing: number } }, tx) => {
    const isIncoming = tx.to.user.id === currentUser?.id;
    const partnerName = isIncoming ? tx.from.user.name : tx.to.user.name;
    const amount = Math.abs(tx.amount);

    if (!acc[partnerName]) {
      acc[partnerName] = { name: partnerName, incoming: 0, outgoing: 0 };
    }

    if (isIncoming) {
      acc[partnerName].incoming += amount;
    } else {
      acc[partnerName].outgoing += amount;
    }

    return acc;
  }, {});

  const topPartnersData = Object.values(topPartners)
    .map(partner => ({
      name: partner.name,
      incoming: partner.incoming,
      outgoing: partner.outgoing,
      total: partner.incoming + partner.outgoing
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ChevronsUpDown className="w-4 h-4" />;
    return sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  const sortedTransactions = [...transactions].sort((a, b) => {
    const multiplier = sortOrder === 'asc' ? 1 : -1;
    
    switch (sortField) {
      case 'date':
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * multiplier;
      case 'amount':
        return (a.amount - b.amount) * multiplier;
      case 'from':
        return a.from.user.name.localeCompare(b.from.user.name) * multiplier;
      case 'to':
        return a.to.user.name.localeCompare(b.to.user.name) * multiplier;
      default:
        return 0;
    }
  });

  // Add after other data processing
  const dailyTransactionCount = transactions.reduce((acc: { [key: string]: number }, tx) => {
    const date = new Date(tx.createdAt).toLocaleString('default', {
      month: 'numeric',
      day: 'numeric'
    });
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});

  const dailyTransactionData = Object.entries(dailyTransactionCount)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => {
      const [aMonth, aDay] = a.date.split('/').map(Number);
      const [bMonth, bDay] = b.date.split('/').map(Number);
      return (aMonth - bMonth) || (aDay - bDay);
    });

  // Calculate running balance using current account balance
  const runningBalanceData = transactions
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) // Sort newest first
    .reduce((acc: { date: string; balance: number; incoming: number; outgoing: number }[], tx) => {
      const currentBalance = acc.length > 0 ? acc[acc.length - 1].balance : (accounts[0]?.balance || 0);
      const isIncomingTransaction = tx.to.user.id === currentUser?.id;
      const transactionAmount = isIncomingTransaction ? -Math.abs(tx.amount) : Math.abs(tx.amount); // Reverse the sign since we're going backwards
      const newBalance = currentBalance + transactionAmount;
      const date = new Date(tx.createdAt).toLocaleString('cs-CZ', {
        month: 'numeric',
        day: 'numeric'
      });
      
      // Calculate daily volume split into incoming and outgoing
      const existingDateIndex = acc.findIndex(item => item.date === date);
      if (existingDateIndex !== -1) {
        if (isIncomingTransaction) {
          acc[existingDateIndex].incoming += Math.abs(tx.amount);
        } else {
          acc[existingDateIndex].outgoing -= Math.abs(tx.amount); // Make outgoing negative
        }
        acc[existingDateIndex].balance = newBalance;
        return acc;
      }
      
      return [...acc, { 
        date, 
        balance: newBalance, 
        incoming: isIncomingTransaction ? Math.abs(tx.amount) : 0,
        outgoing: isIncomingTransaction ? 0 : -Math.abs(tx.amount) // Make outgoing negative
      }];
    }, [])
    .reverse(); // Reverse back to chronological order

  // Show loading screen while checking localStorage and fetching initial data
  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
        <div className="bg-white/90 backdrop-blur-3xl p-8 rounded-2xl shadow-xl border border-white/20 w-full max-w-md">
          <div className="flex flex-col items-center">
            <div className="relative mb-8">
              <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600"></div>
              {/* <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-indigo-600 font-medium">
                Loading...
              </div> */}
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">CzechiBank Analytics</h1>
            <p className="text-gray-600">Loading your financial data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-500">
      {!isAuthenticated ? (
        <div className="h-screen flex items-center justify-center">
          <div className="bg-white/90 backdrop-blur-3xl p-8 rounded-2xl shadow-xl border border-white/20 w-full max-w-md">
            <h1 className="text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
              CzechiBank Analytics
            </h1>
            <p className="text-gray-600 mb-8">Access your financial insights and transaction analysis</p>
            <div className="space-y-4">
              <div>
                <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
                  Enter your API Key to continue
                </label>
                <input
                  type="text"
                  id="token"
                  value={token || ''}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Your API Key here"
                  autoComplete="off"
                />
              </div>
              <button
                onClick={() => fetchData(token)}
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : 'Continue'}
              </button>
              {error && (
                <div className="text-red-600 text-sm mt-2">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="container mx-auto p-8">
          <div className="flex justify-between items-center mb-12">
            <div className="flex items-center space-x-8">
              <h1 className="text-4xl font-bold text-white">
                CzechiBank Analytics
              </h1>
              {currentUser && (
                <div className="flex items-center space-x-4 text-white/90">
                  <div className="h-8 w-px bg-white/20"></div>
                  <div className="flex flex-col">
                    <span className="font-medium">{currentUser.name}</span>
                    <span className="text-sm text-white/70">{currentUser.email}</span>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setToken('');
                setIsAuthenticated(false);
                setTransactions([]);
                setAccounts([]);
                localStorage.removeItem('czechibank_api_key');
              }}
              className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-medium hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Logout
            </button>
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="relative">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-indigo-600 font-medium">
                  Loading...
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Balance Over Time Chart */}
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-white/20">
                  <h2 className="text-xl font-semibold mb-8 text-gray-800">Balance Over Time</h2>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={balanceData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis 
                          dataKey="date" 
                          stroke="#6B7280"
                          angle={-45}
                          textAnchor="end"
                          height={80}
                          tickMargin={25}
                          interval="preserveStartEnd"
                          minTickGap={50}
                          tick={{
                            fontSize: 12,
                            fill: '#4B5563'
                          }}
                        />
                        <YAxis 
                          stroke="#6B7280"
                          tickFormatter={(value: number) => `${value}`}
                          width={120}
                          domain={['auto', 'auto']}
                          padding={{ top: 20, bottom: 20 }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            border: '1px solid #E5E7EB',
                            borderRadius: '0.5rem',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                          }}
                          formatter={(value: number) => [`${value}`, 'Balance']}
                          labelFormatter={(label: string) => `Date: ${label}`}
                        />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="balance" 
                          name="Balance (CZECHITOKEN)"
                          stroke="#4F46E5" 
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Monthly Transaction Volume */}
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-white/20">
                  <h2 className="text-xl font-semibold mb-8 text-gray-800">Monthly Transaction Volume</h2>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="month" stroke="#6B7280" />
                        <YAxis 
                          stroke="#6B7280"
                          tickFormatter={(value: number) => `${value}`}
                          width={120}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            border: '1px solid #E5E7EB',
                            borderRadius: '0.5rem',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                          }}
                          formatter={(value: number) => [`${value}`, value >= 0 ? 'Received' : 'Sent']}
                        />
                        <Legend />
                        <Bar 
                          dataKey="incoming" 
                          name="Received"
                          fill="#4F46E5"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar 
                          dataKey="outgoing" 
                          name="Sent"
                          fill="#10B981"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Transaction Type Distribution */}
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-white/20">
                  <h2 className="text-xl font-semibold mb-8 text-gray-800">Transaction Type Distribution</h2>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(transactionTypes).map(([name, value]) => ({ name, value }))}
                          cx="50%"
                          cy="50%"
                          labelLine={true}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                          paddingAngle={0}
                          label={({ name, value, percent }) => 
                            `${name}: ${value} (${(percent * 100).toFixed(1)}%)`
                          }
                        >
                          {Object.entries(transactionTypes).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            border: '1px solid #E5E7EB',
                            borderRadius: '0.5rem',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                          }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top Transaction Partners */}
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-white/20">
                  <h2 className="text-xl font-semibold mb-8 text-gray-800">Top Transaction Partners</h2>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topPartnersData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis 
                          type="number"
                          stroke="#6B7280"
                          tickFormatter={(value: number) => `${value}`}
                        />
                        <YAxis 
                          type="category"
                          dataKey="name" 
                          stroke="#6B7280"
                          width={120}
                          tick={{
                            fontSize: 12,
                            fill: '#4B5563'
                          }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            border: '1px solid #E5E7EB',
                            borderRadius: '0.5rem',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                          }}
                          formatter={(value: number) => [`${value}`, '']}
                        />
                        <Legend />
                        <Bar 
                          dataKey="incoming" 
                          name="Received"
                          fill="#4F46E5"
                          stackId="a"
                          radius={[0, 4, 4, 0]}
                        />
                        <Bar 
                          dataKey="outgoing" 
                          name="Sent"
                          fill="#10B981"
                          stackId="a"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Daily Transaction Count */}
              <div className="bg-white p-8 rounded-2xl shadow-xl border border-white/20 mt-8">
                <h2 className="text-xl font-semibold mb-8 text-gray-800">Daily Transaction Count</h2>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyTransactionData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#6B7280"
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tickMargin={25}
                        interval="preserveStartEnd"
                        minTickGap={50}
                        tick={{
                          fontSize: 12,
                          fill: '#4B5563'
                        }}
                        tickFormatter={(value: string) => value.split('/')[1] + '.' + value.split('/')[0]}
                      />
                      <YAxis 
                        stroke="#6B7280"
                        width={50}
                        tickFormatter={(value: number) => Math.floor(value).toString()}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(255, 255, 255, 0.9)',
                          border: '1px solid #E5E7EB',
                          borderRadius: '0.5rem',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                        formatter={(value: number) => [`${value} transactions`, 'Count']}
                        labelFormatter={(label: string) => `Date: ${label}`}
                      />
                      <Legend />
                      <Bar 
                        dataKey="count" 
                        name="Number of Transactions"
                        fill="#8B5CF6"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Running Balance vs Transaction Volume */}
              <div className="col-span-2 bg-white p-8 rounded-2xl shadow-xl border border-white/20 mt-8">
                <h2 className="text-xl font-semibold mb-8 text-gray-800">Running Balance vs Transaction Volume</h2>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={runningBalanceData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#6B7280"
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tickMargin={25}
                        interval={0}
                        minTickGap={10}
                        tick={{
                          fontSize: 12,
                          fill: '#4B5563'
                        }}
                        tickFormatter={(value: string) => value.split('.')[0] + '.' + value.split('.')[1]}
                        scale="point"
                      />
                      <YAxis 
                        yAxisId="balance"
                        stroke="#4F46E5"
                        tickFormatter={(value: number) => `${value}`}
                        width={120}
                        domain={['auto', 'auto']}
                        padding={{ top: 20, bottom: 20 }}
                      />
                      <YAxis 
                        yAxisId="volume"
                        orientation="right"
                        stroke="#10B981"
                        tickFormatter={(value: number) => `${value}`}
                        width={120}
                        domain={['dataMin', 'dataMax']}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(255, 255, 255, 0.9)',
                          border: '1px solid #E5E7EB',
                          borderRadius: '0.5rem',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                        formatter={(value: number, name: string) => [
                          `${value} CZECHITOKEN`,
                          name === 'balance' ? 'Balance' : name
                        ]}
                        labelFormatter={(label: string) => `Date: ${label}`}
                      />
                      <Legend />
                      <Line 
                        yAxisId="balance"
                        type="monotone" 
                        dataKey="balance" 
                        name="Running Balance"
                        stroke="#4F46E5" 
                        strokeWidth={2}
                        dot={false}
                      />
                      <Bar
                        yAxisId="volume"
                        dataKey="outgoing"
                        name="Sent"
                        fill="#EF4444"
                        radius={[4, 4, 0, 0]}
                        opacity={0.75}
                        barSize={20}
                      />
                      <Bar
                        yAxisId="volume"
                        dataKey="incoming"
                        name="Received"
                        fill="#10B981"
                        radius={[4, 4, 0, 0]}
                        opacity={0.75}
                        barSize={20}
                      />
                      <Brush
                        dataKey="date"
                        height={30}
                        stroke="#8884d8"
                        startIndex={Math.max(0, runningBalanceData.length - 20)}
                        endIndex={runningBalanceData.length - 1}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Transaction Stats Table */}
              <div className="mt-8">
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-white/20">
                  <h2 className="text-xl font-semibold mb-8 text-gray-800">Transaction Statistics</h2>
                  
                  {/* Summary Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-6 rounded-xl">
                      <p className="text-sm text-indigo-600 font-medium">Total Transactions</p>
                      <p className="text-2xl font-bold text-indigo-900">{transactionStats.totalTransactions}</p>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-6 rounded-xl">
                      <p className="text-sm text-emerald-600 font-medium">Total Volume</p>
                      <p className="text-2xl font-bold text-emerald-900">{transactionStats.totalVolume} CZECHITOKEN</p>
                    </div>
                    <div className="bg-gradient-to-br from-amber-50 to-amber-100 p-6 rounded-xl">
                      <p className="text-sm text-amber-600 font-medium">Average Amount</p>
                      <p className="text-2xl font-bold text-amber-900">{transactionStats.averageAmount} CZECHITOKEN</p>
                    </div>
                  </div>

                  {/* Transactions Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50/50 backdrop-blur-sm sticky top-0">
                        <tr>
                          <th 
                            scope="col" 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100/50 transition-colors"
                            onClick={() => handleSort('date')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Date</span>
                              {getSortIcon('date')}
                            </div>
                          </th>
                          <th 
                            scope="col" 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100/50 transition-colors"
                            onClick={() => handleSort('amount')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>Amount</span>
                              {getSortIcon('amount')}
                            </div>
                          </th>
                          <th 
                            scope="col" 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100/50 transition-colors"
                            onClick={() => handleSort('from')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>From</span>
                              {getSortIcon('from')}
                            </div>
                          </th>
                          <th 
                            scope="col" 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100/50 transition-colors"
                            onClick={() => handleSort('to')}
                          >
                            <div className="flex items-center space-x-1">
                              <span>To</span>
                              {getSortIcon('to')}
                            </div>
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Currency
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white/50 backdrop-blur-sm divide-y divide-gray-200">
                        {sortedTransactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {new Date(tx.createdAt).toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                              })}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <span className={`font-medium ${tx.to.user.id === currentUser?.id ? 'text-green-600' : 'text-red-600'}`}>
                                {tx.to.user.id === currentUser?.id ? '+' : '-'}{Math.abs(tx.amount)} CZECHITOKEN
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div className="flex items-center">
                                <span className="truncate max-w-[200px]" title={tx.from.user.name}>
                                  {tx.from.user.name}
                                </span>
                                <span className="ml-2 text-xs text-gray-400">
                                  ({tx.from.number})
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <div className="flex items-center">
                                <span className="truncate max-w-[200px]" title={tx.to.user.name}>
                                  {tx.to.user.name}
                                </span>
                                <span className="ml-2 text-xs text-gray-400">
                                  ({tx.to.number})
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {tx.currency}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
