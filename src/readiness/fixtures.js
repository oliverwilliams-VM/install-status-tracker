// All records in the review environment are fictitious, including mail addresses.
import { plusDays } from './model.js';
export function fixtures(today) {
  const countries = ['UK', 'IE', 'NL', 'DE', 'UK', 'NL', 'DE', 'IE'];
  return countries.map((country, i) => ({
    binding: { id: `review-${i + 1}`, store: String(999990 + i), country, boardId: { UK: '5678172488', IE: '7519472262', NL: '5757397415', DE: '5757508504' }[country], itemId: String(900001 + i), installDate: plusDays(today, [2, 4, 6, 10, 12, 15, 18, 20][i]), installType: i % 3 ? 'sfk' : 'other' },
    revision: 1, fzeEmail: `store-${999990 + i}@franchisee.example`, mfpEmail: `${country.toLowerCase()}-mfp@subway.example`, sent: {}, history: [], submitted: i === 1 || i === 4,
    answers: i === 1 || i === 4 ? { name: 'Demo Store Manager', team: 'yes', area: 'yes', powerData: i === 1 ? 'no' : 'yes', peds: 'yes', floorplan: 'yes', table: 'yes', tableDelivery: '', comments: i === 1 ? 'Electrician is booked for tomorrow. Please confirm the cabling requirements.' : 'All preparations complete. The table is on site.' } : null,
    pedForm: i % 3 ? 'Returned' : 'Awaiting return', pedOrder: i % 2 ? 'Ordered' : 'Not ordered', shipping: '', shippingStatus: i === 1 ? 'Delivered' : 'Awaiting tracking', notes: [], outcome: i === 4 ? 'Live' : 'Booked', actionOwner: ['Sophie', 'James', 'Ben'][i % 3], actionDue: plusDays(today, 1),
    legacyComments: i === 3 ? [{ name: 'Demo FZE', at: today + 'T08:00:00Z', comments: 'Bitte den Zugang über den Hintereingang nutzen.', source: 'Existing readiness form · demonstration' }] : []
  }));
}
