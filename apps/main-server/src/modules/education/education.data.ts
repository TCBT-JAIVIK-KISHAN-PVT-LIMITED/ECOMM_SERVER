export interface CourseLecture {
  id: string;
  title: string;
  description: string;
  duration: number;
  order: number;
  isFree: boolean;
  r2Key: string;
}

export interface CourseData {
  id: string;
  folderId: string;
  title: string;
  tagline: string;
  price: number;
  instructor?: string;
  instructorTitle?: string;
  lectures: CourseLecture[];
}

export const COURSES: CourseData[] = [
  {
    id: 'tcbt-organic-farming-101',
    folderId: 'gg2nb30e2f74022da4c78b2a2a21827e18611',
    title: 'TCBT वृक्षायुर्वेद विज्ञान',
    tagline: 'Learn the ancient wisdom of Panchmahabhut-based farming',
    price: 999,
    instructor: 'प्रोफेसर ताराचंद बेलजी',
    instructorTitle: 'TCBT कृषि संस्थापक एवं प्रणेता',
    lectures: [
      {
        id: 'class-01',
        title: 'कक्षा 01: TCBT वृक्षायुर्वेद विज्ञान (01-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 1 - पंचमहाभूत एवं प्राकृतिक कृषि का परिचय।',
        duration: 122,
        order: 1,
        isFree: true,
        r2Key: 'videos/CLASS 1.mp4',
      },
      {
        id: 'class-02',
        title: 'कक्षा 02: TCBT वृक्षायुर्वेद विज्ञान (03-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 2 - भूमि शोधन एवं मिट्टी की उर्वरता वृद्धि।',
        duration: 79,
        order: 2,
        isFree: false,
        r2Key: 'videos/CLASS 2.mp4',
      },
      {
        id: 'class-03',
        title: 'कक्षा 03: TCBT वृक्षायुर्वेद विज्ञान (04-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 3 - जीवामृत एवं बीजामृत निर्माण तकनीक।',
        duration: 139,
        order: 3,
        isFree: false,
        r2Key: 'videos/CLASS 3.mp4',
      },
      {
        id: 'class-04',
        title: 'कक्षा 04: TCBT वृक्षायुर्वेद विज्ञान (05-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 4 - पंचगव्य एवं प्राकृतिक ऊर्जा प्रवाह।',
        duration: 125,
        order: 4,
        isFree: false,
        r2Key: 'videos/CLASS 4.mp4',
      },
      {
        id: 'class-05',
        title: 'कक्षा 05: TCBT वृक्षायुर्वेद विज्ञान (06-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 5 - जैव विविधता एवं फसल सुरक्षा के नियम।',
        duration: 128,
        order: 5,
        isFree: false,
        r2Key: 'videos/CLASS 5.mp4',
      },
      {
        id: 'class-06',
        title: 'कक्षा 06: TCBT वृक्षायुर्वेद विज्ञान (07-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 6 - प्राकृतिक कीट नियंत्रक फॉर्मूलेशन।',
        duration: 138,
        order: 6,
        isFree: false,
        r2Key: 'videos/CLASS 6.mp4',
      },
      {
        id: 'class-07',
        title: 'कक्षा 07: TCBT वृक्षायुर्वेद विज्ञान (10-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 7 - फंगस एवं बैक्टीरिया जनित रोगों का प्रबंधन।',
        duration: 165,
        order: 7,
        isFree: false,
        r2Key: 'videos/CLASS 7.mp4',
      },
      {
        id: 'class-08',
        title: 'कक्षा 08: TCBT वृक्षायुर्वेद विज्ञान (11-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 8 - भस्म रसायन एवं पोषण प्रबंधन।',
        duration: 135,
        order: 8,
        isFree: false,
        r2Key: 'videos/CLASS 8.mp4',
      },
      {
        id: 'class-09',
        title: 'कक्षा 09: TCBT वृक्षायुर्वेद विज्ञान (12-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 9 - पौधों की रोग प्रतिरोधक क्षमता बढ़ाना।',
        duration: 110,
        order: 9,
        isFree: false,
        r2Key: 'videos/CLASS 9.mp4',
      },
      {
        id: 'class-10',
        title: 'कक्षा 10: TCBT वृक्षायुर्वेद विज्ञान (13-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 10 - सूक्ष्म पोषक तत्वों की आपूर्ति।',
        duration: 117,
        order: 10,
        isFree: false,
        r2Key: 'videos/CLASS 10.mp4',
      },
      {
        id: 'class-11',
        title: 'कक्षा 11: TCBT वृक्षायुर्वेद विज्ञान (14-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 11 - बीज संस्कार एवं अंकुरण तकनीक।',
        duration: 153,
        order: 11,
        isFree: false,
        r2Key: 'videos/CLASS 11.mp4',
      },
      {
        id: 'class-12',
        title: 'कक्षा 12: TCBT वृक्षायुर्वेद विज्ञान (17-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 12 - जल प्रबंधन एवं ऊर्जा युक्त सिंचाई।',
        duration: 122,
        order: 12,
        isFree: false,
        r2Key: 'videos/CLASS 12.mp4',
      },
      {
        id: 'class-13',
        title: 'कक्षा 13: TCBT वृक्षायुर्वेद विज्ञान (18-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 13 - मिश्रित खेती एवं सहफसली प्रणाली।',
        duration: 120,
        order: 13,
        isFree: false,
        r2Key: 'videos/CLASS 13.mp4',
      },
      {
        id: 'class-14',
        title: 'कक्षा 14: TCBT वृक्षायुर्वेद विज्ञान (19-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 14 - देशी गाय आधारित कृषि का वैज्ञानिक महत्व।',
        duration: 139,
        order: 14,
        isFree: false,
        r2Key: 'videos/CLASS 14.mp4',
      },
      {
        id: 'class-15',
        title: 'कक्षा 15: TCBT वृक्षायुर्वेद विज्ञान (20-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 15 - कंपोस्टिंग एवं जीवाणु खाद उत्पादन।',
        duration: 133,
        order: 15,
        isFree: false,
        r2Key: 'videos/CLASS 15.mp4',
      },
      {
        id: 'class-16',
        title: 'कक्षा 16: TCBT वृक्षायुर्वेद विज्ञान (21-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 16 - खरपतवार नियंत्रण एवं मल्चिंग तकनीक।',
        duration: 130,
        order: 16,
        isFree: false,
        r2Key: 'videos/CLASS 16.mp4',
      },
      {
        id: 'class-17',
        title: 'कक्षा 17: TCBT वृक्षायुर्वेद विज्ञान (24-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 17 - फलदार वृक्षों के लिए विशेष वृक्षायुर्वेद रसायन।',
        duration: 135,
        order: 17,
        isFree: false,
        r2Key: 'videos/CLASS 17.mp4',
      },
      {
        id: 'class-18',
        title: 'कक्षा 18: TCBT वृक्षायुर्वेद विज्ञान (25-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 18 - सब्जियों की जैविक खेती एवं रोग निवारण।',
        duration: 131,
        order: 18,
        isFree: false,
        r2Key: 'videos/CLASS 18.mp4',
      },
      {
        id: 'class-19',
        title: 'कक्षा 19: TCBT वृक्षायुर्वेद विज्ञान (26-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 19 - अनाज एवं दलहन फसलों की उन्नत प्राकृतिक विधि।',
        duration: 135,
        order: 19,
        isFree: false,
        r2Key: 'videos/CLASS 19.mp4',
      },
      {
        id: 'class-20',
        title: 'कक्षा 20: TCBT वृक्षायुर्वेद विज्ञान (27-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 20 - फसल कटाई उपरांत प्रबंधन एवं भंडारण।',
        duration: 140,
        order: 20,
        isFree: false,
        r2Key: 'videos/CLASS 20.mp4',
      },
      {
        id: 'class-21',
        title: 'कक्षा 21: TCBT वृक्षायुर्वेद विज्ञान (28-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 21 - गुण नियंत्रण एवं जैविक उत्पाद मानक।',
        duration: 102,
        order: 21,
        isFree: false,
        r2Key: 'videos/CLASS 21.mp4',
      },
      {
        id: 'class-22',
        title: 'कक्षा 22: TCBT वृक्षायुर्वेद विज्ञान (31-08-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 22 - मौसम परिवर्तन एवं अनुकूलन रणनीतियां।',
        duration: 143,
        order: 22,
        isFree: false,
        r2Key: 'videos/CLASS 22.mp4',
      },
      {
        id: 'class-23',
        title: 'कक्षा 23: TCBT वृक्षायुर्वेद विज्ञान (01-09-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 23 - नैनो तकनीक एवं वैदिक कृषि का समन्वय।',
        duration: 133,
        order: 23,
        isFree: false,
        r2Key: 'videos/CLASS 23.mp4',
      },
      {
        id: 'class-24',
        title: 'कक्षा 24: TCBT वृक्षायुर्वेद विज्ञान (02-09-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 24 - प्राकृतिक फफूंदनाशक एवं कीटनाशक निर्माण।',
        duration: 136,
        order: 24,
        isFree: false,
        r2Key: 'videos/CLASS 24.mp4',
      },
      {
        id: 'class-25',
        title: 'कक्षा 25: TCBT वृक्षायुर्वेद विज्ञान (03-09-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 25 - गौ आधारित अर्थव्यवस्था एवं स्वावलंबन।',
        duration: 133,
        order: 25,
        isFree: false,
        r2Key: 'videos/CLASS 25.mp4',
      },
      {
        id: 'class-26',
        title: 'कक्षा 26: TCBT वृक्षायुर्वेद विज्ञान (04-09-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 26 - ऊर्जा चक्र एवं चंद्रकला आधारित रोपण।',
        duration: 130,
        order: 26,
        isFree: false,
        r2Key: 'videos/CLASS 26.mp4',
      },
      {
        id: 'class-27',
        title: 'कक्षा 27: TCBT वृक्षायुर्वेद विज्ञान (07-09-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 27 - भूमि की उर्वरा शक्ति की त्वरित पुनर्प्राप्ति।',
        duration: 126,
        order: 27,
        isFree: false,
        r2Key: 'videos/CLASS 27.mp4',
      },
      {
        id: 'class-28',
        title: 'कक्षा 28: TCBT वृक्षायुर्वेद विज्ञान (08-09-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 28 - जैविक उत्पाद प्रमाणीकरण एवं PGS प्रणाली।',
        duration: 128,
        order: 28,
        isFree: false,
        r2Key: 'videos/CLASS 28.mp4',
      },
      {
        id: 'class-29',
        title: 'कक्षा 29: TCBT वृक्षायुर्वेद विज्ञान (09-09-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 29 - जैविक उत्पादों की मार्केटिंग एवं ब्रांडिंग।',
        duration: 123,
        order: 29,
        isFree: false,
        r2Key: 'videos/CLASS 29.mp4',
      },
      {
        id: 'class-30',
        title: 'कक्षा 30: TCBT वृक्षायुर्वेद विज्ञान (10-09-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 30 - लागत घटाने और मुनाफा बढ़ाने के सूत्र।',
        duration: 120,
        order: 30,
        isFree: false,
        r2Key: 'videos/CLASS 30.mp4',
      },
      {
        id: 'class-31',
        title: 'कक्षा 31: TCBT वृक्षायुर्वेद विज्ञान (11-09-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 31 - उन्नत किसान अनुभव एवं केस स्टडीज।',
        duration: 135,
        order: 31,
        isFree: false,
        r2Key: 'videos/CLASS 31.mp4',
      },
      {
        id: 'class-32',
        title: 'कक्षा 32: TCBT वृक्षायुर्वेद विज्ञान (14-09-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 32 - खेत का इकोसिस्टम एवं मित्र कीट संवर्धन।',
        duration: 109,
        order: 32,
        isFree: false,
        r2Key: 'videos/CLASS 32.mp4',
      },
      {
        id: 'class-33',
        title: 'कक्षा 33: TCBT वृक्षायुर्वेद विज्ञान (14-09-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 33 - विशेष समस्याएं एवं उनके सटीक प्राकृतिक समाधान।',
        duration: 71,
        order: 33,
        isFree: false,
        r2Key: 'videos/CLASS 33.mp4',
      },
      {
        id: 'class-34',
        title: 'कक्षा 34: TCBT वृक्षायुर्वेद विज्ञान (16-09-2026)',
        description:
          'TCBT वृक्षायुर्वेद विज्ञान CLASS 34 - संपूर्ण पाठ्यक्रम का सारांश एवं प्रश्नोत्तरी।',
        duration: 129,
        order: 34,
        isFree: false,
        r2Key: 'videos/CLASS 34.mp4',
      },
    ],
  },
];
