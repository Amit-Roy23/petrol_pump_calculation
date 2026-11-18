import { attendanceHandler } from './_lib/attendance';
import { mongoStore } from './_lib/store';

const store = mongoStore();
export default attendanceHandler(() => store);
