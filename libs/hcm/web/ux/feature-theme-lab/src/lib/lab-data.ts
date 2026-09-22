export interface LabEmployee {
	id: string
	firstName: string
	lastName: string
	preferredName: string
	name: string
	initials: string
	position: string
	department: string
	email: string
	phone: string
	dateOfBirth: string
	status: string
	employmentType: string
	manager: string
	location: string
	joined: string
	skills: readonly { name: string; rating: number }[]
	leaveBalance: number
	leaveBalances: readonly { type: string; available: number }[]
	leaveRequests: readonly (typeof LAB_LEAVE)[number][]
	employmentHistory: readonly { title: string; date: string; description: string }[]
	documents: readonly string[]
	projectAssignments: readonly (typeof LAB_PROJECTS)[number][]
}
const PEOPLE = [
	['Michael Scott', 'MS', 'Regional Manager', 'Leadership'],
	['Jim Halpert', 'JH', 'Account Executive', 'Sales'],
	['Pam Beesly', 'PB', 'Office Administrator', 'Operations'],
	['Dwight Schrute', 'DS', 'Senior Account Executive', 'Sales'],
	['Angela Martin', 'AM', 'Accounting Lead', 'Finance'],
	['Kevin Malone', 'KM', 'Accountant', 'Finance'],
	['Oscar Martinez', 'OM', 'Financial Analyst', 'Finance'],
	['Toby Flenderson', 'TF', 'People Partner', 'People'],
] as const
export const LAB_LEAVE = [
	{
		id: 'LV-2041',
		employeeId: 'DEMO-002',
		name: 'Jim Halpert',
		type: 'Annual leave',
		start: '2026-10-12',
		end: '2026-10-16',
		days: 5,
		status: 'Approved',
		comment: 'Family trip. Coverage arranged with Dwight.',
	},
	{
		id: 'LV-2042',
		employeeId: 'DEMO-003',
		name: 'Pam Beesly',
		type: 'Personal leave',
		start: '2026-10-22',
		end: '2026-10-23',
		days: 2,
		status: 'Pending',
		comment: 'Personal appointment; handover notes ready.',
	},
	{
		id: 'LV-2043',
		employeeId: 'DEMO-005',
		name: 'Angela Martin',
		type: 'Annual leave',
		start: '2026-11-02',
		end: '2026-11-06',
		days: 5,
		status: 'Pending',
		comment: 'Month-end reporting completed before departure.',
	},
] as const
export const LAB_PROJECTS = [
	{
		id: 'PR-101',
		name: 'Customer onboarding',
		client: 'Lackawanna Paper · fictional',
		progress: 72,
		status: 'On track',
		start: '2026-08-01',
		target: '2026-11-30',
		members: ['Jim Halpert', 'Pam Beesly', 'Dwight Schrute'],
	},
	{
		id: 'PR-102',
		name: 'Quarter-end readiness',
		client: 'Internal finance',
		progress: 48,
		status: 'Needs attention',
		start: '2026-09-01',
		target: '2026-12-15',
		members: ['Angela Martin', 'Oscar Martinez', 'Kevin Malone'],
	},
	{
		id: 'PR-103',
		name: 'People experience',
		client: 'Internal people team',
		progress: 85,
		status: 'On track',
		start: '2026-07-15',
		target: '2026-10-30',
		members: ['Toby Flenderson', 'Pam Beesly'],
	},
] as const

export const LAB_EMPLOYEES: readonly LabEmployee[] = PEOPLE.map(
	/** Create deterministic fictional employees without customer data. */ (
		[name, initials, position, department],
		index,
	) => ({
		id: `DEMO-${String(index + 1).padStart(3, '0')}`,
		name,
		firstName: name.split(' ')[0],
		lastName: name.split(' ').slice(1).join(' '),
		preferredName: name.split(' ')[0],
		initials,
		position,
		department,
		email: name.toLowerCase().replace(' ', '.') + '@dunder.example',
		phone: `+1 202 555 01${String(index).padStart(2, '0')}`,
		dateOfBirth: `198${index}-03-15`,
		status: 'Active',
		employmentType: 'Full time',
		manager: index === 0 ? 'David Wallace' : 'Michael Scott',
		location: 'Scranton · Pennsylvania',
		joined: `20${14 + index}-06-15`,
		leaveBalance: 18 - index,
		leaveBalances: [
			{ type: 'Annual leave', available: 18 - index },
			{ type: 'Personal leave', available: 3 },
		],
		leaveRequests: LAB_LEAVE.filter(
			/** Link requests to their fictional employee. */ (request) =>
				request.employeeId === `DEMO-${String(index + 1).padStart(3, '0')}`,
		),
		employmentHistory: [
			{ title: position, date: '2026-09-01', description: 'Current assignment in ' + department },
			{
				title: 'Joined the team',
				date: `20${14 + index}-06-15`,
				description: 'Onboarding and work eligibility checks completed.',
			},
		],
		documents: ['Employment agreement.pdf', 'Onboarding checklist.pdf'],
		projectAssignments: LAB_PROJECTS.filter(
			/** Link only actual members of the fictional project. */ (project) =>
				(project.members as readonly string[]).includes(name),
		),
		skills: [
			{ name: 'Communication', rating: 4 },
			{
				name: department === 'Finance' ? 'Financial planning' : 'Customer relationships',
				rating: 3,
			},
			{ name: 'Collaboration', rating: 5 },
		],
	}),
)
