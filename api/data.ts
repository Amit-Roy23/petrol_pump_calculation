import { dataHandler } from './_lib/handlers';
import { mongoStore } from './_lib/store';

const store = mongoStore();
export default dataHandler(() => store);
