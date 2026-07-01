'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Save, Loader2, Plus, X,
} from 'lucide-react';

const categories = [
  'general', 'onboarding', 'offboarding', 'maintenance',
  'security', 'compliance', 'disaster-recovery',
];

export default function NewChecklistPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [dueDate, setDueDate] = useState('');
  const [tags, setTags] = useState('');
  const [items, setItems] = useState<{ text: string; order: number }[]>([
    { text: '', order: 0 },
  ]);
  const [loading, setLoading] = useState(false);

  const addItem = () => {
    setItems([...items, { text: '', order: items.length }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const filteredItems = items.filter((item) => item.text.trim());

    const res = await fetch('/api/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, description, category,
        dueDate: dueDate || null,
        items: filteredItems,
        tags: tagList,
      }),
    });

    if (res.ok) {
      const checklist = await res.json();
      router.push(`/dashboard/checklists/${checklist.id}`);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/checklists" className="p-2 hover:bg-slate-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Checklist</h1>
          <p className="text-slate-500">Create a repeatable workflow</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="input-field"
            placeholder="e.g., New Employee Onboarding"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            className="input-field" rows={2}
            placeholder="Brief description..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field">
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1).replace('-', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
            <input
              type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="input-field"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Tags (comma separated)</label>
          <input
            type="text" value={tags} onChange={(e) => setTags(e.target.value)}
            className="input-field" placeholder="onboarding, hr"
          />
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700">Checklist Items</label>
            <button type="button" onClick={addItem} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Item
            </button>
          </div>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm text-slate-400 w-6 text-right">{i + 1}.</span>
                <input
                  type="text"
                  value={item.text}
                  onChange={(e) => {
                    const newItems = [...items];
                    newItems[i].text = e.target.value;
                    setItems(newItems);
                  }}
                  className="input-field flex-1"
                  placeholder={`Step ${i + 1}...`}
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/dashboard/checklists" className="btn-secondary">Cancel</Link>
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Checklist
          </button>
        </div>
      </form>
    </div>
  );
}
