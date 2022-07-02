import { GetServerSideProps } from 'next'

export type MyGetServerSideProps = (
  context: Parameters<GetServerSideProps>[0] &
    { req: { sequelize: any } }
) => ReturnType<GetServerSideProps>
