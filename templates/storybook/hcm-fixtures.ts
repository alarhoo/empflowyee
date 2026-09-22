export const employeeFixture = {
	id: 'EMP-10042',
	displayName: 'Alex Morgan',
	position: 'Senior Analyst',
	department: 'Operations',
	workLocation: 'Bengaluru',
	status: 'Active',
}

export const employeeRowsFixture = Array.from(
	{ length: 12 },
	/** Create deterministic fictional rows for workshop examples. */ (_, index) => ({
		id: `EMP-${1000 + index}`,
		name: `Employee ${index + 1}`,
		department: index % 2 === 0 ? 'Operations' : 'Finance',
		location: index % 3 === 0 ? 'Bengaluru' : 'Mumbai',
		status: index % 5 === 0 ? 'On Leave' : 'Active',
	}),
)
